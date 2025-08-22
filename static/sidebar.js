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
            <span class="nick">${semantic.player(state, player.id)}</span>
            ${player.connected ? null : ['(disconnected', kickButton(state, player.id), ')']}
        </div>
    `;
};

const renderPlayerList = (state) => {
    return html`
    <div class="player-list row wrap">
        <div>
            ${
        state.game.players.filter((p) => p.is_in_game && p.team === false).map(
            (p) => renderPlayer(state, p),
        )
    }
        </div>
        <div>
            ${state.game.players.filter((p) => p.is_in_game && p.team === true).map((p) => renderPlayer(state, p))}
        </div>
        <div>
            ${state.game.players.filter((p) => p.is_in_game && p.team === null).map((p) => renderPlayer(state, p))}
        </div>
    </div>
    `;
};

const renderChatMessage = (state, msg) => {
    // Parse tag syntax like <@user_id>
    let tags = [];
    let text = msg.text.replace(/<(.+?)>|\n/g, (match, tag) => {
        let i = tags.length;
        if (match === '\n') {
            tags.push('br');
        } else {
            tags.push(tag);
        }
        return '<' + i + '>';
    });
    text = text.split(/<.+?>/g);

    tags = tags.map((tag) => {
        let m = tag.match(/^\@([0-9a-f-]+)$/);
        if (m) {
            let player = state.game.players.find((p) => p.id === m[1]);
            if (player) {
                return semantic.player(state, player.id);
            }
        }
        m = tag.match(/^team:(0|1)$/);
        if (m) {
            return semantic.team(state, parseInt(m[1]) === 1);
        }
        m = tag.match(/^clue:text:(.+)$/);
        if (m) {
            return semantic.clueText(state, m[1]);
        }
        m = tag.match(/^clue:drawing:(.+)$/);
        if (m) {
            return semantic.clueDrawing(state, m[1]);
        }
        if (tag == 'br' || tag == '\n') {
            return html`<br>`;
        }
        return '<' + tag + '>'; // Note: this is not html, but a string literal
    });

    console.assert(text.length === tags.length + 1, 'Text and tags mismatch');

    let rendered = [];
    for (let i = 0; i < text.length; i++) {
        rendered.push(text[i]);
        if (i !== text.length - 1) {
            rendered.push(tags[i]);
        }
    }

    return html`
    <div class="chat-message row ${msg.author === null ? 'system-msg' : 'user-msg'}">
        <span class="author">
            ${msg.author === null ? '' : state.game.players.find((p) => p.id === msg.author).nick}
        </span>
        <span class="content">
            ${rendered}
        </span>
    </div>
    `;
};

const renderGlobalChat = (state) => {
    const onKeyPress = (e) => {
        if (e.key === 'Enter') {
            let text = state.global_chat_input.trim();
            if (text.length > 0) {
                state.dispatchEvent(new CustomEvent('send-cmd', {
                    detail: { global_chat: text },
                    bubbles: true,
                    composed: true,
                }));
                state.global_chat_input = '';
                e.target.value = ''; // Clear input field
            }
        }
    };

    return html`
    <div class="global-chat column">
        <h3>Global Chat</h3>
        <div class="messages column" style="justify-content: flex-start">
            ${state.game.global_chat.map((msg) => renderChatMessage(state, msg))}
        </div>
        <input
            type="text"
            placeholder="Message everyone..."
            .value=${state.global_chat_input}
            @input=${(e) => state.global_chat_input = e.target.value}
            @keypress=${onKeyPress}
        />
    </div>
    `;
};

export default function sidebar(state) {
    return html`
    <div id="sidebar" class="column" style="justify-content: flex-start; flex-grow: 0">
        ${renderPlayerList(state)}
        ${renderGlobalChat(state)}
    </div>
    `;
}
