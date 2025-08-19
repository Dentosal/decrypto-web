#![allow(unused_imports)]
#![allow(dead_code)]
#![deny(unused_must_use)]

use axum::{
    Router,
    extract::{
        State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    response::Response,
    routing::{any, get},
};
use futures::stream::StreamExt;
use parking_lot::Mutex;
use std::{env, sync::Arc};
use tower_http::services::ServeDir;

use crate::{id::ConnectionId, message::FromClient};

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
        .with_state(shared_state)
        .fallback_service(static_files);
    let addr = std::env::args().nth(1).unwrap_or("0.0.0.0:3000".to_owned());
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    log::info!("Listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

async fn ws(ws: WebSocketUpgrade, State(state): State<Arc<Mutex<app::State>>>) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<Mutex<app::State>>) {
    let id = ConnectionId::new();
    log::info!("Client {id:?} connected");

    let (sender, mut receiver) = socket.split();
    {
        let mut state = state.lock();
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
                match serde_json::from_str::<FromClient>(&*text) {
                    Ok(payload) => {
                        let _ = state.lock().on_message(id, payload).await;
                    }
                    Err(_) => {
                        log::warn!("Failed to parse message: {}", text);
                        let _ = state
                            .lock()
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

    let mut state = state.lock();
    state.on_disconnect(id).await;
}
