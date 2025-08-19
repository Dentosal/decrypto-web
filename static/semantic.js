// Semantic UI components

import { html } from 'https://unpkg.com/lit-html?module';


const startHighlight = e => {
    let playerId = e.target.getAttribute('x-hl');
    document.querySelectorAll('span[x-hl="' + playerId + '"]').forEach(el => {
        el.classList.add('highlight');
    });
}

const endHighlight = e => {
    let playerId = e.target.getAttribute('x-hl');
    document.querySelectorAll('span[x-hl="' + playerId + '"]').forEach(el => {
        el.classList.remove('highlight');
    });
}

const player = (state, playerId) => {
    let player = state.game.players.find(p => p.id === playerId);
    return html`<span
        x-mention="${player.id}"
        x-hl="player:${player.id}"
        @mouseenter=${startHighlight}
        @mouseleave=${endHighlight}
    >${team(state, player.team, true)}${player.team !== null ? " "  : ""}${player.nick}</span>`;
}

const team = (state, team, shorthand) => {
    if (team === null) return shorthand ? html`<span>⧄</span>` : html`<span>⧄ Not in a team</span>`;
    return html`<span
        x-hl="team:${team}"
        @mouseenter=${startHighlight}
        @mouseleave=${endHighlight}
    >${shorthand ? (team ? "■" : "□") : (team ? "■ Team 2" : "□ Team 1")}</span>`;
}

const code = (state, code, team) => {
    if (code === null) return html`<span>N/A</span>`;
    return html`<span>${code.map(c => c + 1).join("-")}</span>`;
}

const round = (state, index) => {
    return html`<span
        x-hl="round:${index}"
        @mouseenter=${startHighlight}
        @mouseleave=${endHighlight}
    >${index + 1}</span>`;
}

const result = (state, result) => {
    return html`<span
        x-result="${result}"
        x-hl="result:${result}"
        @mouseenter=${startHighlight}
        @mouseleave=${endHighlight}
    >${result === null ? "N/A" : (result ? "success" : "fail")}</span>`;
}

export default {
    player,
    team,
    code,
    round,
    result,
};