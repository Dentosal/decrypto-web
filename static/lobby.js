import { html } from 'https://unpkg.com/lit?module';
import semantic from './semantic.js';

const kickButton = (state, playerId) => {
    return html`
        <button class="kick-button" @click=${() => {
            state.dispatchEvent(new CustomEvent('send-cmd', {
                detail: { kick: playerId },
                bubbles: true,
                composed: true,
            }));
        }}>
            Kick
        </button>
    `;
};

const renderPlayer = (state, player) => {
    return html`
        <div class="player">
            ${semantic.player(state, player.id)}
            ${player.connected ? null : ['(disconnected', kickButton(state, player.id), ')']}
        </div>
    `;
};

export default function viewLobby(state) {
    return html`
    <div id="lobby">
        <h1>
            Waiting for players to join
            <input
                type="button"
                value="Leave lobby"
                @click=${() => {
                    state.dispatchEvent(new CustomEvent('send-cmd', {
                        detail: { leave_lobby: null },
                        bubbles: true,
                        composed: true,
                    }));
                }}
            />
        </h1>
        <p>Invite link: <a id="invite-link" href="${window.location.origin}/#join_${state.game.id}">${window.location.origin}/#join_${state.game.id}</a></p>
        <p>
            <input
                type="button"
                id="start-game"
                value="Start game"
                ?disabled=${state.game.reason_not_startable}
                @click=${() => {
                    state.dispatchEvent(new CustomEvent('send-cmd', {
                        detail: { start_game: null },
                        bubbles: true,
                        composed: true,
                    }));
                }}
            />
            ${state.game.reason_not_startable ? html`(${state.game.reason_not_startable})` : ''}
        </p>
        <h2>Teams</h2>
        <div id="lobby-teams" class="row wrap">
            <div>
                <h3>No team selected</h3>
                ${state.game.players.filter((p) => p.is_in_game && p.team === null).map((p) => renderPlayer(state, p))}
            </div>
            <div>
                <h3>
                    Team 1
                    <input
                        type="button"
                        value="Join"
                        id="join-team-1"
                        @click=${() => {
                            state.dispatchEvent(new CustomEvent('send-cmd', {
                                detail: { join_team: false },
                                bubbles: true,
                                composed: true,
                            }));
                        }}
                    />
                </h3>
                ${
        state.game.players.filter((p) => p.is_in_game && p.team === false).map(
            (p) => renderPlayer(state, p),
        )
    }
            </div>
            <div>
                <h3>
                    Team 2
                    <input
                        type="button"
                        value="Join"
                        id="join-team-2"
                        @click=${() => {
                            state.dispatchEvent(new CustomEvent('send-cmd', {
                                detail: { join_team: true },
                                bubbles: true,
                                composed: true,
                            }));
                        }}
                    />
                </h3>
                ${state.game.players.filter((p) => p.is_in_game && p.team === true).map((p) => renderPlayer(state, p))}
            </div>
        </div>
        <h2>Settings</h2>
        <h3>Wordlist</h3>
        <select id="wordlist-select" @change=${(e) => {
        let settings = JSON.parse(JSON.stringify(state.game.settings));
        settings.wordlist = e.target.value;
        state.dispatchEvent(new CustomEvent('send-cmd', {
            detail: { change_settings: settings },
            bubbles: true,
            composed: true,
        }));
    }}>
            ${
        state.wordlists.map((wl) =>
            html`<option value="${wl}" ?selected=${wl === state.game.settings.wordlist}>${wl}</option>`
        )
    }
        </select>
        TODO: custom wordlists
        <h3>Other settings</h3>
        TODO: proper settings editor
        <pre><code>${JSON.stringify(state.game.settings, null, 2)}</code></pre>
    </div>
    `;
}
