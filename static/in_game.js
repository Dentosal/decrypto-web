import { html } from 'https://unpkg.com/lit?module';
import semantic from './semantic.js';
import './components/paint.js';
import './input_action/give_clues.js';
import './input_action/decipher.js';
import './input_action/intercept.js';
import './input_action/tiebreaker.js';
import './input_action/waiting_for.js';


const renderKeywords = (state) => {
    return html`
    <div class="row keywords">
        Team keywords:
        ${
        state.game.keywords.map((keyword, index) =>
            html`
            <div>${index + 1}. <span class="keyword">${keyword}</span></div>
        `
        )
    }
    </div>`;
};


const renderAction = (state) => {
    let myTeam = state.game.players.find((p) => p.id === state.user_info.id).team;

    // do state resets if needed
    if (!('encrypt' in state.game.inputs)) {
        state.clue_inputs = [];
        state.clue_input_draw = null;
    }

    if ('encrypt' in state.game.inputs) {
        return html`<clue-giver-view .state=${state}></clue-giver-view>`;
    } else if ('guess' in state.game.inputs) {
        let intercept = state.game.inputs.guess.intercept;
        let decipher = state.game.inputs.guess.decipher;
        let deadline = state.game.inputs.guess.deadline;
        return html`${[
            decipher ? html`<decipher-view .state=${state}></decipher-view>` : null,
            intercept ? html`<intercept-view .state=${state}></intercept-view>` : null,
            deadline ? html`<deadline-display .deadline=${deadline}></deadline-display>` : null,
        ]}`;
    } else if ('waiting_for_encryptors' in state.game.inputs || 'waiting_for_guessers' in state.game.inputs) {
        let waitingFor = state.game.inputs.waiting_for_encryptors?.teams || state.game.inputs.waiting_for_guessers?.teams;
        let deadline = state.game.inputs.waiting_for_encryptors?.deadline || state.game.inputs.waiting_for_guessers?.deadline;
        let waitText;
        if (waitingFor[+myTeam] && waitingFor[+!myTeam]) {
            waitText = state.game.inputs.waiting_for_encryptors
                ? 'Waiting for both teams to finish encrypting...'
                : 'Waiting for both teams to finish guessing...';
        } else if (waitingFor[+myTeam]) {
            waitText = state.game.inputs.waiting_for_encryptors
                ? 'Waiting for your team to finish encrypting...'
                : 'Waiting for your team to finish guessing...';
        } else {
            waitText = state.game.inputs.waiting_for_encryptors
                ? 'Waiting for the other team to finish encrypting...'
                : 'Waiting for the other team to finish guessing...';
        }
        return html`<waiting-for .state=${state} .deadline=${deadline}>${waitText}</waiting-for>`;
    } else if ('tiebreaker' in state.game.inputs) {
        let deadline = state.game.inputs.tiebreaker.deadline;
        return html`
            <tiebreaker-view
                .state=${state}
                .deadline=${deadline}
            ></tiebreaker-view>
            ${deadline ? html`<deadline-display .deadline=${deadline}></deadline-display>` : null}
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
        ${renderKeywords(state)}
        ${renderAction(state)}
        <div class="spacer"></div>
        ${renderInterceptionMatrix(state, !myTeam)}
        ${renderRoundHistory(state)}
    <div>
    `;
}
