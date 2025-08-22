import { html, LitElement } from 'https://unpkg.com/lit?module';
import viewLobby from './lobby.js';
import viewInGame from './in_game.js';
import topbar from './topbar.js';
import sidebar from './sidebar.js';
import './components/nick.js';
import './components/paint.js';
import './components/hurry_up.js';
import './components/deadline.js';
import './components/give_clues.js';
import './components/decipher.js';
import './components/intercept.js';
import './components/tiebreaker.js';
import './components/waiting_for.js';

class AppRoot extends LitElement {
    static properties = {
        ws: { type: Object },
        user_info: { type: Object },
        game: { type: Object },
        global_chat_input: { type: String },
        clue_input_draw: { type: Object },
        override_view: { type: String },
        version: { type: Object },
        wordlists: { type: Array },
        error: { type: Object },
        error_expires: { type: Number },
    };

    constructor() {
        super();

        this.ws = null;
        this.user_info = null;
        this.game = null;
        this.global_chat_input = '';
        this.clue_input_draw = null;
        this.override_view = null;
        this.version = null;
        this.wordlists = [];
        this.error = null;
        this.error_expires = null;
    }

    createRenderRoot() {
        return this; // Disable shadow DOM for the root element
    }

    async connectedCallback() {
        super.connectedCallback();

        // HACK: for debugging, expose the inner state
        window.state = this;

        document.getElementById('init-load').innnerText = 'Initializing...';

        this.version = await((await fetch('/version')).json());
        this.wordlists = await((await fetch('/wordlists')).json());

        document.getElementById('init-load').innnerText = 'Connecting...';

        this.ws = new WebSocket('/ws');
        this.ws.addEventListener('message', e => this.onMessage(e));
        this.ws.addEventListener('open', () => {
            this.dispatchEvent(new CustomEvent('send-cmd', {
                detail: { auth: { secret: localStorage.getItem('secret') || null } },
                bubbles: true,
                composed: true,
            }));
        });
        this.ws.addEventListener('error', (e) => {
            console.error('WebSocket error:', e);
            document.getElementById('error').innerText = e.message;
            document.getElementById('error').classList.remove('severity-info');
            document.getElementById('error').classList.remove('severity-warning');
            document.getElementById('error').classList.add('severity-error');
        });
        this.ws.addEventListener('close', (e) => {
            document.getElementById('error').innerText = 'Server closed connection unexpectedly ' + e.reason;
            document.getElementById('error').classList.remove('severity-info');
            document.getElementById('error').classList.remove('severity-warning');
            document.getElementById('error').classList.add('severity-error');
        });

        this.addEventListener('send-cmd', e => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return; // TODO: show error
            console.log('send: ' + JSON.stringify(e.detail));
            this.ws.send(JSON.stringify(e.detail));
        });

        document.getElementById('init-load').remove();
    }

    onMessage(event) {
        const msg = JSON.parse(event.data);
        console.log('recv: ' + JSON.stringify(msg));
        if (msg.state) {
            this.user_info = msg.state.user_info;
            this.game = msg.state.game;
            localStorage.setItem('secret', this.user_info.secret);
            // HACK: scroll to bottom of chat messages
            // TODO: do this properly
            for (const el of document.querySelectorAll('.messages')) {
                el.scrollTop = el.scrollHeight;
            }
        }
        if (msg.error) {
            // TODO: proper toast system, and different handling for hard errors
            let id = Math.random().toString(36);
            this.error = msg.error;
            this.error.id = id;
            document.getElementById('error').innerText = this.error.message;
            document.getElementById('error').classList.remove('severity-info');
            document.getElementById('error').classList.remove('severity-warning');
            document.getElementById('error').classList.remove('severity-error');
            document.getElementById('error').classList.add(
                'severity-' + this.error.severity,
            );
            setTimeout(() => {
                if (this.error.id !== id) return; // ignore if error has changed
                this.error = null;
                document.getElementById('error').innerText = '';
                document.getElementById('error').classList.remove('severity-info');
                document.getElementById('error').classList.remove('severity-warning');
                document.getElementById('error').classList.remove('severity-error');
            }, 5000);
        }
    }

    render() {
        if (!this.user_info?.nick || this.override_view === 'nick_required') {
            return html`${[
                topbar(this), 
                html`<nickname-input @set=${e => {
                    this.dispatchEvent(new CustomEvent('send-cmd', {
                        detail: { set_nick: e.detail },
                        bubbles: true,
                        composed: true,
                    }));
                    this.override_view = null;
                }}></nickname-input>`
            ]}`;
        }
        
        if (window.location.hash.startsWith('#join_')) {
            const gameId = window.location.hash.slice(6);
            if (this.game && this.game.id !== gameId) {
                return html`TODO: game stay or switch view`;
            }
            this.dispatchEvent(new CustomEvent('send-cmd', {
                detail: { join_lobby: gameId },
                bubbles: true,
                composed: true,
            }));
            window.location.hash = '';
            return html`<p>Joining lobby...</p>`;
        }
        
        if (this.game) {
            let view;
            if (this.game.state === 'lobby') {
                view = viewLobby;
            } else {
                view = viewInGame;
            }
            return html`${topbar(this)}<div class="sidebar-split">${[
                view(this),
                sidebar(this),
            ]}</div>`;
        }

        return html`
            ${topbar(this)}
            <div id="welcome">
                <div>
                To join a lobby, please use a link sent by the host.
                </div>
                <br>
                <input type="button" @click=${() => {
                    this.dispatchEvent(new CustomEvent('send-cmd', {
                        detail: { create_lobby: null },
                        bubbles: true,
                        composed: true,
                    }));
                }} id="create-lobby" value="Create lobby">
            </div>
        `;
    }
}
customElements.define('app-root', AppRoot);

window.onhashchange = () => {
    if (window.location.hash.startsWith('#join_')) {
        window.location.reload();
    }
};
