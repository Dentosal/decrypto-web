#![allow(unused_imports)]
#![allow(dead_code)]
#![allow(clippy::large_enum_variant)]
#![deny(unused_must_use)]

use axum::{
    Router,
    body::Bytes,
    extract::{
        Path, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{any, get, post},
};
use futures::stream::StreamExt;
use std::{env, fs, sync::Arc};
use tokio::sync::Mutex;
use tower_http::services::ServeDir;
use uuid::Uuid;

use crate::{
    decrypto::settings::available_wordlists,
    id::{ConnectionId, DrawingId, GameId},
    message::FromClient,
};

mod app;
mod decrypto;
mod id;
mod message;

#[tokio::main]
async fn main() {
    env_logger::init();
    let shared_state = Arc::new(Mutex::new(app::State::default()));
    let static_files = ServeDir::new("./static");
    let app = Router::new()
        .route("/ws", any(ws))
        .with_state(shared_state.clone())
        .route("/version", get(get_version))
        .route("/wordlists", get(get_wordlists))
        .route("/drawing/{game_id}/{drawing_id}", get(get_drawing))
        .route("/drawing/{game_id}", post(post_drawing))
        .with_state(shared_state)
        .fallback_service(static_files);
    let addr = std::env::args().nth(1).unwrap_or("0.0.0.0:3000".to_owned());
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    log::info!("Listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

pub async fn get_version() -> Response {
    let crate_version = env!("CARGO_PKG_VERSION");
    let git_hash = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    axum::Json(serde_json::json!({
        "crate": crate_version,
        "git": git_hash,
    }))
    .into_response()
}

pub async fn get_wordlists() -> Response {
    let mut wordlists = available_wordlists();

    wordlists.sort();
    if let Some(i) = wordlists.iter().position(|s| s == "original") {
        wordlists.swap(0, i);
    }

    axum::Json(serde_json::json!(wordlists)).into_response()
}

async fn get_drawing(
    Path((game_id, drawing_id)): Path<(GameId, DrawingId)>,
    State(state): State<Arc<Mutex<app::State>>>,
) -> Response {
    let state = state.lock().await;
    let Some(game) = state.games.get(&game_id) else {
        log::warn!("Game {game_id:?} not found");
        return (StatusCode::NOT_FOUND, "Game not found").into_response();
    };

    let Some(drawing) = game.drawings.get(&drawing_id) else {
        log::warn!("Drawing {drawing_id:?} not found in game {game_id:?}");
        return (StatusCode::NOT_FOUND, "Drawing not found").into_response();
    };

    axum::response::Response::builder()
        .header("Content-Type", "image/png")
        .body(axum::body::Body::from(drawing.clone()))
        .unwrap()
        .into_response()
}

async fn post_drawing(
    Path(game_id): Path<GameId>,
    State(state): State<Arc<Mutex<app::State>>>,
    body: Bytes,
) -> Response {
    let mut state = state.lock().await;
    let Some(game) = state.games.get_mut(&game_id) else {
        log::warn!("Game {game_id:?} not found");
        return (StatusCode::NOT_FOUND, "Game not found").into_response();
    };

    if body.len() > 1024 * 1024 {
        log::warn!("Drawing too large");
        return (StatusCode::PAYLOAD_TOO_LARGE, "Drawing too large").into_response();
    }

    let id = DrawingId::new();
    game.drawings.insert(id, body.to_vec());

    (StatusCode::OK, id.0.to_string()).into_response()
}

async fn ws(ws: WebSocketUpgrade, State(state): State<Arc<Mutex<app::State>>>) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<Mutex<app::State>>) {
    let id = ConnectionId::new();
    log::info!("Client {id:?} connected");

    let (sender, mut receiver) = socket.split();
    {
        let mut state = state.lock().await;
        state.on_connect(id, sender).await;
    }

    while let Some(msg) = receiver.next().await {
        let Ok(msg) = msg else {
            log::warn!("Error receiving message or client disconnected");
            // client disconnected, or perhaps an error occurred
            break;
        };

        match msg {
            axum::extract::ws::Message::Text(text) => {
                log::debug!("Received text message: {}", text);
                match serde_json::from_str::<FromClient>(&text) {
                    Ok(payload) => {
                        let _ = state.lock().await.on_message(id, payload).await;
                    }
                    Err(_) => {
                        log::warn!("Failed to parse message: {}", text);
                        let _ = state
                            .lock()
                            .await
                            .send_to_connection(
                                id,
                                message::ToClient::Error {
                                    message: "Unknown message received".to_owned(),
                                    severity: message::ErrorSeverity::Error,
                                },
                            )
                            .await;
                        break;
                    }
                }
            }
            axum::extract::ws::Message::Binary(_) => {
                log::warn!("Received binary message, not supported");
                break;
            }
            axum::extract::ws::Message::Close(_) => {
                log::info!("Client disconnected");
                break;
            }
            _ => {}
        }
    }

    let mut state = state.lock().await;
    state.on_disconnect(id).await;
}
