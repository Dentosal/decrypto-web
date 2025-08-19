import { html } from 'https://unpkg.com/lit-html?module';
import semantic from './semantic.js';

const kickButton = (state, playerId) => {
    return html`
        <button class="kick-button" @click=${() => state.send({ kick: playerId })}>
            Kick
        </button>
    `;
}

const renderPlayer = (state, player) => {
    return html`
        <div class="player">
            ${semantic.player(state, player.id)}
            ${player.connected ? null : ["(disconnected", kickButton(state, player.id), ")"]}
        </div>
    `;
}

export default function viewInGame(state) {
    return html`
    <div id="lobby">
        <h1>
            Waiting for players to join
            <input
                type="button"
                value="Leave lobby"
                @click=${() => state.send({ leave_lobby: null })}
            />
        </h1>
        <p>Invite link: <a id="invite-link" href="${window.location.origin}/#join_${state.game.id}">${window.location.origin}/#join_${state.game.id}</a></p>
        <p>
            <input
                type="button"
                id="start-game"
                value="Start game"
                ?disabled=${state.game.lobby.reason_not_startable}
                @click=${() => state.send({ start_game: null })}
            />
            ${state.game.lobby.reason_not_startable ? html`(${state.game.lobby.reason_not_startable})` : ''}
        </p>
        <h2>Teams</h2>
        <div id="lobby-teams" class="row wrap">
            <div>
                <h3>No team selected</h3>
                ${state.game.players.filter(p => p.is_in_game && p.team === null).map(p => renderPlayer(state, p))}
            </div>
            <div>
                <h3>
                    Team 1
                    <input
                        type="button"
                        value="Join"
                        id="join-team-1"
                        @click=${() => state.send({ join_team: false })}
                    />
                </h3>
                ${state.game.players.filter(p => p.is_in_game && p.team === false).map(p => renderPlayer(state, p))}
            </div>
            <div>
                <h3>
                    Team 2
                    <input
                        type="button"
                        value="Join"
                        id="join-team-2"
                        @click=${() => state.send({ join_team: true })}
                    />
                </h3>
                ${state.game.players.filter(p => p.is_in_game && p.team === true).map(p => renderPlayer(state, p))}
            </div>
        </div>
        <h2>Settings</h2>
        TODO: settings editor
        <pre><code>${JSON.stringify(state.game.settings, null, 2)}</code></pre>
        TODO: custom wordlists
    </div>
    `;
}
