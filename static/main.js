import { html, render } from 'https://unpkg.com/lit-html?module';
import viewLobby from './lobby.js';
import viewInGame from './in_game.js';
import topbar from './topbar.js';
import sidebar from './sidebar.js';

const state = {
    ws: null,
    user_info: null,
    game: null,
    nickname_input: '',
    decipher_input: '',
    intercept_input: '',
    global_chat_input: '',
    clue_inputs: [],
    override_view: null,
    error: null,
    error_expires: null,
};

const connect = () => {
    state.ws = new WebSocket('/ws');
    state.ws.addEventListener('message', onMessage);
    state.ws.addEventListener('open', () => {
        console.log("WebSocket connection established");
        // send({ auth: { secret: localStorage.getItem('secret') || null } });
        send({ auth: { secret: null } }); // xxx
    });
    state.ws.addEventListener('error', e => {
        console.error("WebSocket error:", e);
        document.getElementById('error').innerText = e.message;
        document.getElementById('error').classList.remove("severity-info");
        document.getElementById('error').classList.remove("severity-warning");
        document.getElementById('error').classList.add("severity-error");
    });
    state.ws.addEventListener('close', e => {
        document.getElementById('error').innerText = "Server closed connection unexpectedly " + e.reason;
        document.getElementById('error').classList.remove("severity-info");
        document.getElementById('error').classList.remove("severity-warning");
        document.getElementById('error').classList.add("severity-error");
    });
};

const onMessage = event => {
    const msg = JSON.parse(event.data);
    console.log("recv: " + JSON.stringify(msg));
    if (msg.state) {
        state.user_info = msg.state.user_info;
        state.game = msg.state.game;
        // localStorage.setItem('secret', state.user_info.secret);
        update();
    }
    if (msg.error) {
        // TODO: proper toast system, and different handling for hard errors
        let id = Math.random().toString(36);
        state.error = msg.error;
        state.error.id = id;
        document.getElementById('error').innerText = state.error.message;
        document.getElementById('error').classList.remove("severity-info");
        document.getElementById('error').classList.remove("severity-warning");
        document.getElementById('error').classList.remove("severity-error");
        document.getElementById('error').classList.add("severity-" + state.error.severity);
        setTimeout(() => {
            if (state.error.id !== id) return; // ignore if error has changed
            state.error = null;
            document.getElementById('error').innerText = '';
            document.getElementById('error').classList.remove("severity-info");
            document.getElementById('error').classList.remove("severity-warning");
            document.getElementById('error').classList.remove("severity-error");
        }, 5000);
    }
};

const send = (msg) => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return; // TODO: show error
    console.log("send: " + JSON.stringify(msg));
    state.ws.send(JSON.stringify(msg));
}
    
const viewNickRequired = () => {
    const onInput = (e) => {
        state.nickname_input = e.target.value;
    };
    const onKeyPress = (e) => {
        if (e.key === 'Enter') {
            send({ set_nick: state.nickname_input });
            state.override_view = null;
        }
    };

    // xxx: dev helper, remove this later
    send({ set_nick: "auto"+Math.random().toString(16).slice(2) });
    return html`setting randomnick...`;

    // return html`
    // <div>
    //     <p>Select a nickname:</p>
    //     <input
    //         id="nick-input"
    //         type="text"
    //         placeholder="Nickname"
    //         .value=${state.nickname_input}
    //         @input=${onInput}
    //         @keypress=${onKeyPress}
    //         autofocus
    //     />
    // </div>
    // `;
};

const createLobby = () => {
    send({ create_lobby: null });
}

const viewNotInLobby = () => {
    return html`
    <div id="welcome">
        <div>
        To join a lobby, please use a link sent by the host.
        </div>
        <br>
        <input type="button" @click=${createLobby} value="Create lobby">
    </div>
    `;
};

const currentView = () => {
    if (!state.user_info?.nick || state.override_view === 'nick_required') {
        return viewNickRequired();
    }

    if (window.location.hash.startsWith('#join_')) {
        const gameId = window.location.hash.slice(6);
        if (state.game && state.game.id !== gameId) {
            return html`TODO: game stay or switch view`;
        }
        send({ join_lobby: gameId });
        window.location.hash = '';
        return html`<p>Joining lobby...</p>`;
    }

    if (state.game) {
        let view;
        if ("lobby" in state.game) {
            view = viewLobby;
        } else {
            view = viewInGame;
        }
        return html`${topbar(state)}<div class="sidebar-split">${[view(state), sidebar(state)]}</div>`;
    }

    return html`${[topbar(state), viewNotInLobby(state)]}`;
}

const update = () => {
    render(currentView(), document.getElementById('app'));
    // Auto-focus on nickname input if it's visible
    document.getElementById("nick-input")?.focus();
    // Auto-scroll to bottom of messages
    // TODO: only do this if new messages were added
    for (const el of document.querySelectorAll('.messages')) {
        el.scrollTop = el.scrollHeight;
    }
};

// Methods accessible from the child modules
state.update = update;
state.send = send;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('init-load').innnerText = 'Connecting...';
    connect();
    document.getElementById('init-load').remove();
    update();
});

window.onhashchange = () => {
    if (window.location.hash.startsWith('#join_')) {
        window.location.reload();
    }
};

// debug helper, remove this later?
window.state = state;
