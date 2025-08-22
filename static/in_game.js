import { html } from 'https://unpkg.com/lit?module';
import semantic from './semantic.js';


const renderKeywords = (game) => {
    return html`
    <div class="row keywords">
        Team keywords:
        ${
        game.keywords.map((keyword, index) =>
            html`
            <div>${index + 1}. <span class="keyword">${keyword}</span></div>
        `
        )
    }
    </div>`;
};


const renderAction = (game, user_info) => {
    let myTeam = game.players.find((p) => p.id === user_info.id).team;

    if ('encrypt' in game.inputs) {
        let deadline = game.inputs.encrypt.deadline;
        return html`
            <clue-giver-view .game=${game} .user_info=${user_info}></clue-giver-view>
            <deadline-display .game=${game} .deadline=${deadline}></deadline-display>
        `;
    } else if ('guess' in game.inputs) {
        let intercept = game.inputs.guess.intercept;
        let decipher = game.inputs.guess.decipher;
        let deadline = game.inputs.guess.deadline;
        return html`${[
            decipher ? html`<decipher-view .game=${game} .user_info=${user_info}></decipher-view>` : null,
            intercept ? html`<intercept-view .game=${game} .user_info=${user_info}></intercept-view>` : null,
            deadline ? html`<deadline-display .game=${game} .deadline=${deadline}></deadline-display>` : null,
        ]}`;
    } else if ('waiting_for_encryptors' in game.inputs || 'waiting_for_guessers' in game.inputs) {
        let waitingFor = game.inputs.waiting_for_encryptors?.teams || game.inputs.waiting_for_guessers?.teams;
        let deadline = game.inputs.waiting_for_encryptors?.deadline || game.inputs.waiting_for_guessers?.deadline;
        let waitText;
        if (waitingFor[+myTeam] && waitingFor[+!myTeam]) {
            waitText = game.inputs.waiting_for_encryptors
                ? 'Waiting for both teams to finish encrypting...'
                : 'Waiting for both teams to finish guessing...';
        } else if (waitingFor[+myTeam]) {
            waitText = game.inputs.waiting_for_encryptors
                ? 'Waiting for your team to finish encrypting...'
                : 'Waiting for your team to finish guessing...';
        } else {
            waitText = game.inputs.waiting_for_encryptors
                ? 'Waiting for the other team to finish encrypting...'
                : 'Waiting for the other team to finish guessing...';
        }
        return html`<waiting-for .state=${state} .deadline=${deadline}>${waitText}</waiting-for>`;
    } else if ('tiebreaker' in game.inputs) {
        let deadline = game.inputs.tiebreaker.deadline;
        return html`
            <tiebreaker-view
                .game=${game}
                .user_info=${user_info}
                .deadline=${deadline}
            ></tiebreaker-view>
            ${deadline ? html`<deadline-display .game=${game} .deadline=${deadline}></deadline-display>` : null}
        `;
    } else {
        return html`Error: unknown game state ???`;
    }
};

const renderInterceptionMatrix = (state, team) => {
    return html`
    <table class="matrix">
        <colgroup>
            <col class="col-round"/>
            <col span="${state.game.settings.keyword_count}" class="col-clue"/>
        </colgroup>
        <thead>
            <th>Round</th>
            ${Array(state.game.settings.keyword_count).keys().map((i) => html`<th>${i + 1}</th>`)}
        </thead>
        <tbody>
            ${
        state.game.completed_rounds.map((round, index) =>
            html`
            <tr>
                <td>${semantic.round(state, index)}</td>
                ${Array(state.game.settings.keyword_count).keys().map((i) => {
                    if (!round[+team].clues) {
                        return html`<td>?</td>`;
                    }
                    if (!round[+team].code) {
                        return html`<td>-</td>`;
                    }
                    let lookup = round[+team].code.indexOf(i);
                    if (lookup === -1) {
                        return html`<td></td>`;
                    }
                    let clue = round[+team].clues[lookup];
                    return html`<td>${semantic.clue(state, clue)}</td>`;
                })}
            </tr>`
        )
    }
        </tbody>
    </table>
    `;
};

const renderRoundHistory = (state) => {
    let myTeam = state.game.players.find((p) => p.id === state.user_info.id).team;

    return html`
    <div class="history">
    <table>
        <colgroup>
            <col class="col-round" />
            <col span="5" class="col-team col-your-team tint-my-team" />
            <col span="5" class="col-team col-other-team tint-other-team" />
        </colgroup>
        <thead>
            <tr>
                <th rowspan="2" class="tint-neutralm">Round</th>
                <th colspan="5" class="tint-my-team">Your team</th>
                <th colspan="5" class="tint-other-team">Other team</th>
            </tr>
            <tr>
                <th class="tint-my-team">Encryptor</th>
                <th class="tint-my-team">Code</th>
                <th class="tint-my-team">Clues</th>
                <th class="tint-my-team">Decipher</th>
                <th class="tint-my-team">Intercept</th>
                <th class="tint-other-team">Encryptor</th>
                <th class="tint-other-team">Code</th>
                <th class="tint-other-team">Clues</th>
                <th class="tint-other-team">Decipher</th>
                <th class="tint-other-team">Intercept</th>
            </tr>
        </thead>
        <tbody>
            ${
        state.game.completed_rounds.map((round, index) =>
            html`
                <tr>
                    <td>${semantic.round(state, index)}</td>
                    <td>${semantic.player(state, round[+myTeam].encryptor)}</td>
                    <td>${semantic.code(state, round[+myTeam].code, myTeam)}</td>
                    <td><div class="clues column">
                        ${round[+myTeam].clues !== null
                            ? round[+myTeam].clues.map((clue) => semantic.clue(state, clue))
                            : html`Timed out`
                        }
                    </div></td>
                    <td>
                        ${semantic.code(state, round[+myTeam].decipher, myTeam)}
                        <hr>
                        ${semantic.result(state, round[+!myTeam].score.decipher)}
                    </td>
                    <td>
                        ${semantic.code(state, round[+myTeam].intercept, myTeam)}
                        <hr>
                        ${semantic.result(state, round[+myTeam].score.intercept)}
                    </td>
                    <td>${semantic.player(state, round[+!myTeam].encryptor)}</td>
                    <td>${semantic.code(state, round[+!myTeam].code, !myTeam)}</td>
                    <td><div class="clues column">
                        ${round[+!myTeam].clues !== null
                            ? round[+!myTeam].clues.map((clue) => semantic.clue(state, clue))
                            : html`Timed out`
                        }
                    </div></td>
                    <td>
                        ${semantic.code(state, round[+!myTeam].decipher, !myTeam)}
                        <hr>
                        ${semantic.result(state, round[+!myTeam].score.decipher)}
                    </td>
                    <td>
                        ${semantic.code(state, round[+!myTeam].intercept, !myTeam)}
                        <hr>
                        ${semantic.result(state, round[+!myTeam].score.intercept)}
                    </td>
                </tr>
            `
        )
    }
            ${ state.game.current_round
                ? html`
                <tr>
                    <td>${semantic.round(state, state.game.completed_rounds.length)}</td>
                    <td>${semantic.player(state, state.game.current_round[+myTeam].encryptor)}</td>
                    <td>?</td>
                    <td><div class="clues column">
                        ${state.game.current_round[+myTeam].clues?.map((clue) => semantic.clue(state, clue))}
                    </div></td>
                    <td></td>
                    <td></td>
                    <td>${semantic.player(state, state.game.current_round[+!myTeam].encryptor)}</td>
                    <td>?</td>
                    <td><div class="clues column">
                        ${state.game.current_round[+!myTeam].clues?.map((clue) => semantic.clue(state, clue))}
                    </div></td>
                    <td></td>
                    <td></td>
                </tr>
                `
                : ''
            }
        </tbody>
    </table>
    </div>
    `;
};

export default function viewInGame(state) {
    let myTeam = state.game.players.find((p) => p.id === state.user_info.id).team;

    if (state.game.state === 'game_over') {
        let winner = state.game.winner;
        return html`
        <div id="in_game">
            <div class="input-action game-over">
                <h1>Game Over: ${winner === null ? 'draw' : (winner === myTeam ? 'you won!' : 'you lost!')}</h1>
                <h2>Keywords for your team were:</h2>
                <div class="row keywords">
                ${state.game.keywords[+myTeam].map((keyword, index) =>
                    html`<div>${index + 1}. <span class="keyword">${keyword}</span></div>`
                )}
                </div>
                <h2>Keywords for the other team were:</h2>
                <div class="row keywords">
                    ${state.game.keywords[+!myTeam].map((keyword, index) =>
                        html`<div>${index + 1}. <span class="keyword">${keyword}</span></div>`
                    )}
                </div>
            </div>
            <div class="spacer"></div>
            ${renderInterceptionMatrix(state, !myTeam)}
            ${renderRoundHistory(state)}
        <div>
        `;
    }

    return html`
    <div id="in_game">
        ${renderKeywords(state.game)}
        ${renderAction(state.game, state.user_info)}
        <div class="spacer"></div>
        ${renderInterceptionMatrix(state, !myTeam)}
        ${renderRoundHistory(state)}
    <div>
    `;
}
