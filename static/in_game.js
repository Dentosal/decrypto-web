import { html } from 'https://unpkg.com/lit?module';
import semantic from './semantic.js';
import './paint.js';

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

const renderClueInput = (state, keywordIndex, clueIndex) => {
    let input = [];

    if (state.clue_inputs[clueIndex]?.drawing) {
        input.push( html`
            ${semantic.clueDrawing(state, state.clue_inputs[clueIndex]?.drawing)}
            <input
                type="button"
                value="Remove drawing"
                @click=${() => {
                    delete state.clue_inputs[clueIndex]; // Remove the drawing clue
                    state.update();
                }}
            />
        `);
    } else {
        if (state.game.settings.clue_mode !== 'draw') {
            input.push(html`
            <input
                type="text"
                placeholder="Clue"
                .value=${state.clue_inputs[clueIndex]?.text || ''}
                @input=${(e) => {
                state.clue_inputs[clueIndex] = { text: e.target.value };
                state.update();
            }}
            />
            `);
        }
        if (state.game.settings.clue_mode !== 'text') {
            input.push(html`
            <input
                type="button"
                value=${ state.game.settings.clue_mode === 'either' ? "Draw it instead!?" : "Draw"}
                @click=${() => {
                    delete state.clue_inputs[clueIndex]; // Remove any existing text clue
                    state.clue_input_draw = {
                        clueIndex,
                        title: '' + (keywordIndex + 1) + '. ' + state.game.keywords[clueIndex],
                    };
                    state.update();
                }}
            />
            `);
        }
    }

    return html`
    <tr>
        <td>${keywordIndex + 1}.</td>
        <td>${state.game.keywords[clueIndex]}</td>
        <td class="row">${input}</td>
    </tr>
    `;
};

const submitClues = (state) => {
    let data = [];
    for (let i = 0; i < state.clue_inputs.length; i += 1) {
        if (state.clue_inputs[i]?.text) {
            data.push({ text: state.clue_inputs[i].text });
        } else if (state.clue_inputs[i]?.drawing) {
            data.push({ drawing: state.clue_inputs[i].drawing });
        } else {
            console.error(`Clue input ${i} is empty, skipping`);
        }
    }
    state.dispatchEvent(new CustomEvent('send-cmd', {
        detail: { submit_clues: data },
        bubbles: true,
        composed: true,
    }));
    state.clue_inputs = [];
};

const renderHurryUp = (state, deadline) => {
    if (deadline !== null) {
        return html`
        <div
            class="deadline"
            x-deadline="${deadline.at}"
        />Deadline <span class="seconds-left"></span> seconds (${deadline.reason})</div>
        `;
    }
    return html`
    <input
        type="button"
        value="Hurry up!"
        @click=${() => {
            state.dispatchEvent(new CustomEvent('send-cmd', {
                detail: {
                    encrypting: ('waiting_for_encryptors' in state.game.inputs),
                    teams: (
                        ('waiting_for_encryptors' in state.game.inputs)
                            ? state.game.inputs.waiting_for_encryptors.teams
                            : state.game.inputs.waiting_for_guessers.teams
                    ),
                },
                bubbles: true,
                composed: true,
            }));
        }}
    />
    `;
};

const renderDeadline = (state, deadline) => {
    if (deadline !== null) {
        return html`
        <div
            class="deadline"
            x-deadline="${deadline.at}"
        />Deadline <span class="seconds-left"></span> seconds (${deadline.reason})</div>
        `;
    }
    return null;
};

const parseGuess = (state, guess) => {
    guess = guess.trim();
    let parts = guess.split('-');
    if (parts.length !== state.game.settings.clue_count) {
        return null;
    }
    let result = [];
    for (let i = 0; i < parts.length; i += 1) {
        let num = parseInt(parts[i], 10);
        if (isNaN(num) || num < 1 || num > state.game.settings.keyword_count) {
            return null; // Invalid guess
        }
        result.push(num - 1); // Convert to zero-based index
    }
    if (new Set(result).size !== result.length) {
        return null; // Duplicates in the guess
    }
    return result;
};

const renderDecipher = (state) => {
    let myTeam = state.game.players.find((p) => p.id === state.user_info.id).team;

    const onKeyPress = (e) => {
        if (e.key === 'Enter') {
            let guess = parseGuess(state, e.target.value);
            if (guess === null) {
                e.target.setCustomValidity(e.target.title);
                e.target.reportValidity();
            } else {
                state.dispatchEvent(new CustomEvent('send-cmd', {
                    detail: { submit_decipher: guess },
                    bubbles: true,
                    composed: true,
                }));
            }
        }
    };

    return html`
    <div class="input-action">
        <h1>Attempt to decipher your clues:</h1>
        <ul>
            ${
        state.game.current_round[+myTeam].clues === null
            ? html`<li>Encryptor ran out of time, no clues for you.</li>`
            : state.game.current_round[+myTeam].clues.map((clue) => html`<li>${semantic.clue(state, clue)}</li>`)
    }
        </ul>
        <input
            type="text"
            placeholder="${
        [...Array(state.game.settings.clue_count).keys().map((i) => i + 1)].join(
            '-',
        )
    }"
            required
            title="Enter your guess as a sequence of numbers, separated by dashes (e.g. 1-2-3)"
            .value=${state.decipher_input || ''}
            @input=${(e) => state.decipher_input = e.target.value}
            @keypress=${onKeyPress}
        >
    </div>
    `;
};

const renderIntercept = (state) => {
    let myTeam = state.game.players.find((p) => p.id === state.user_info.id).team;

    const onKeyPress = (e) => {
        if (e.key === 'Enter') {
            let guess = parseGuess(state, e.target.value);
            if (guess === null) {
                e.target.setCustomValidity(e.target.title);
                e.target.reportValidity();
            } else {
                state.dispatchEvent(new CustomEvent('send-cmd', {
                    detail: { submit_intercept: guess },
                    bubbles: true,
                    composed: true,
                }));
            }
        }
    };

    return html`
        <div class="input-action">
            <h1>Attempt interception:</h1>
            ${
        state.game.current_round[+!myTeam].clues === null
            ? html`<li>Encryptor ran out of time, nothing to intercept.</li>`
            : state.game.current_round[+!myTeam].clues.map((clue) => html`<li>${semantic.clue(state, clue)}</li>`)
    }
            <input
                type="text"
                placeholder="${
        [...Array(state.game.settings.clue_count).keys().map((i) => i + 1)].join(
            '-',
        )
    }"
                required
                title="Enter your guess as a sequence of numbers, separated by dashes (e.g. 1-2-3)"
                .value=${state.intercept_input || ''}
                @input=${(e) => state.intercept_input = e.target.value}
                @keypress=${onKeyPress}
            >
        </div>
        `;
};

const renderTiebreaker = (state, deadline) => {
    let myTeam = state.game.players.find((p) => p.id === state.user_info.id).team;

    let inputs = [];
    for (let i = 0; i < state.game.settings.keyword_count; i += 1) {
        let s = state.game.inputs.tiebreaker.submitted[+myTeam][i];
        inputs.push(html`
        <tr>
            <td>${i + 1}.</td>
            <td>${
            s === null
                ? html`<input
                    type="text"
                    placeholder="Guess keyword"
                    .value=${state.tiebreaker_inputs[i] || ''}
                    @input=${(e) => {
                    state.tiebreaker_inputs[i] = e.target.value;
                    state.update();
                }}
                    @keypress=${(e) => {
                    if (e.key === 'Enter') {
                        let guess = e.target.value.trim();
                        if (guess.length > 0) {
                            state.dispatchEvent(new CustomEvent('send-cmd', {
                                detail: { submit_tiebreaker: { index: i, guess } },
                                bubbles: true,
                                composed: true,
                            }));
                        }
                    }
                }}
                />`
                : html`<span class="tiebreaker-guess">${s.guess}</span>`
        }</td>
            <td>${
            s === null ? '' : html`<span class="tiebreaker-is-correct">${s.is_correct ? 'correct' : 'incorrect'}</span>`
        }</td>
            <td>${s === null ? '' : html`<span class="tiebreaker-correct-answer">${s.correct}</span>`}</td>
        </tr>
        `);
    }

    let waitText = 'Waiting for the other team to finish the tiebreaker...';
    return html`
        <div class="input-action">
            <h1>Tiebreaker!</h1>
            <p>Guess the keywords of the other team:</p>
            <table class="tiebreaker-inputs">
                <thead>
                    <th>#</th>
                    <th>Guess</th>
                    <th>Result</th>
                    <th>Actual</th>
                </thead>
                <tbody>${inputs}</tbody>
            </table>

            ${
        state.game.inputs.tiebreaker.teams_done[+myTeam]
            ? html`<div class="input-action"><h1>${waitText}</h1>${renderHurryUp(state, deadline)}</div>`
            : ''
    }
        </div>
    `;
};

const renderAction = (state) => {
    let myTeam = state.game.players.find((p) => p.id === state.user_info.id).team;

    // do state resets if needed
    if (!('encrypt' in state.game.inputs)) {
        state.clue_inputs = [];
        state.clue_input_draw = null;
    }

    if ('encrypt' in state.game.inputs) {
        let code = state.game.inputs.encrypt.code;
        let deadline = state.game.inputs.encrypt.deadline;
        let disabled = Object.keys(state.clue_inputs).length !== code.length ||
            state.clue_inputs.some((c) => !c?.text && !c?.drawing);
        return html`
        <div class="input-action">
            <h1>It's your turn to give clues!</h1>
            <div>
            Code: ${code.map((num) => num + 1).join('-')} (for ${
            code.map((num) => state.game.keywords[num]).join(', ')
        })
            </div>
            <table class="clue-inputs">
                ${code.map((keywordIndex, clueIndex) => renderClueInput(state, keywordIndex, clueIndex))}
            </table>
            <input
                id="submit-clues"
                type="button"
                value="Proceed"
                ?disabled=${disabled}
                @click=${() => submitClues(state)}
            />
            ${renderDeadline(state, deadline)}
            ${state.clue_input_draw !== null
                ? html`<paint-overlay
                    .state=${ state }
                    .gameId=${ state.game.id }
                    .clueArray=${ state.clue_inputs }
                    .clueIndex=${ state.clue_input_draw.clueIndex }
                ><div>
                    <h2>${state.clue_input_draw.title}</h2>
                    ${renderDeadline(state, deadline)}
                </div></paint-overlay> `
                : null
            }            
        </div>
        `;
    } else if ('guess' in state.game.inputs) {
        let intercept = state.game.inputs.guess.intercept;
        let decipher = state.game.inputs.guess.decipher;
        let deadline = state.game.inputs.guess.deadline;
        return html`${[
            decipher ? renderDecipher(state) : null,
            intercept ? renderIntercept(state) : null,
            deadline ? renderDeadline(state, deadline) : null,
        ]}`;
    } else if ('waiting_for_encryptors' in state.game.inputs) {
        let waitingFor = state.game.inputs.waiting_for_encryptors.teams;
        let deadline = state.game.inputs.waiting_for_encryptors.deadline;
        let ourEncryptor = state.game.current_round[+myTeam].encryptor;
        let theirEncryptor = state.game.current_round[+!myTeam].encryptor;
        if (waitingFor[+myTeam] && waitingFor[+!myTeam]) {
            return html`
            <div class="input-action"><h1>
                Waiting for both teams to finish encrypting
                (${semantic.player(state, ourEncryptor)}, ${semantic.player(state, theirEncryptor)})...
            </h1>${renderHurryUp(state, deadline)}</div>`;
        } else if (waitingFor[+myTeam]) {
            return html`<div class="input-action"><h1>
                Waiting for your team to finish encrypting
                (${semantic.player(state, ourEncryptor)})...
            </h1>${renderHurryUp(state, deadline)}</div>`;
        } else {
            return html`<div class="input-action"><h1>
                Waiting for the other team to finish encrypting
                (${semantic.player(state, theirEncryptor)})...
            </h1>${renderHurryUp(state, deadline)}</div>`;
        }
    } else if ('waiting_for_guessers' in state.game.inputs) {
        let waitingFor = state.game.inputs.waiting_for_guessers.teams;
        let deadline = state.game.inputs.waiting_for_guessers.deadline;
        let waitText;
        if (waitingFor[+myTeam] && waitingFor[+!myTeam]) {
            waitText = 'Waiting for both teams to finish guessing...';
        } else if (waitingFor[+myTeam]) {
            waitText = 'Waiting for your team to finish guessing...';
        } else {
            waitText = 'Waiting for the other team to finish guessing...';
        }
        return html`<div class="input-action"><h1>${waitText}</h1>${renderHurryUp(state, deadline)}</div>`;
    } else if ('tiebreaker' in state.game.inputs) {
        let deadline = state.game.inputs.tiebreaker.deadline;
        return html`${[
            renderTiebreaker(state, deadline),
            deadline ? renderDeadline(state, deadline) : null,
        ]}`;
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
