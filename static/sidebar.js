import { html } from 'https://unpkg.com/lit-html?module';

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
            <span class="nick">${player.nick}</span>
            <span class="team">${player.team === null ? "Not in a team" : "Team " + (player.team + 1)}</span>
            ${player.connected ? null : ["(disconnected", kickButton(state, player.id), ")"]}
        </div>
    `;
}

const renderPlayerList = state => {
    return html`
    <div class="player-list column wrap">
        ${state.game.players.filter(p => p.is_in_game).map(p => renderPlayer(state, p))}
    </div>
    `;
}

const renderChatMessage = (state, msg) => {
    // Parse tag syntax like <@user_id>
    let tags = [];
    let text = msg.text.replace(/<(.+?)>/g, (match, tag) => {
        let i = tags.length;
        tags.push(tag);
        return "<" + i + ">";
    });
    text = text.split(/<.+?>/g);

    tags = tags.map(tag => {
        let m = tag.match(/^\@([0-9a-f-]+)$/);
        if (m) {
            let player = state.game.players.find(p => p.id === m[1]);
            if (player) {
                return html`<span class="mention" x-mention=${player.id}>${player.nick}</span>`;
            }
        }
        return "<" + tag + ">"; // Note: this is not html, but a string literal
    });

    console.assert(text.length === tags.length + 1, "Text and tags mismatch");

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
            ${msg.author === null ? 'system' : state.game.players.find(p => p.id === msg.author).nick}
        </span>
        <span class="content">
            ${rendered}
        </span>
    </div>
    `;
}

const renderGlobalChat = state => {
    const onKeyPress = (e) => {
        if (e.key === 'Enter') {
            let text = state.global_chat_input.trim();
            if (text.length > 0) {
                state.send({ global_chat: text });
                state.global_chat_input = "";
                e.target.value = ""; // Clear input field
            }
        }
    };

    return html`
    <div class="global-chat column">
        <h3>Global Chat</h3>
        <div class="messages column" style="justify-content: flex-start">
            ${
                state.game.global_chat.map(msg => renderChatMessage(state, msg))
            }
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
}

export default function sidebar(state) {
    return html`
    <div id="sidebar" class="column" style="justify-content: flex-start; flex-grow: 0">
        ${renderPlayerList(state)}
        ${renderGlobalChat(state)}
    </div>
    `;
}
