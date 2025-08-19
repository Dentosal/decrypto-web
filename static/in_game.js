import { html } from 'https://unpkg.com/lit-html?module';
import semantic from './semantic.js';

const renderKeywords = (state) => {
    return html`
    <div class="row keywords">
        Team keywords:
        ${state.game.in_game.keywords.map((keyword, index) => html`
            <div>${index + 1}. <span class="keyword">${keyword}</span></div>
        `)}
    </div>`;
}

const renderClueInput = (state, idx) => {
    let input = [];
    if (state.game.settings.clue_mode !== 'draw') {
        input.push(html`
        <input
            type="text"
            placeholder="Clue"
            .value=${state.clue_inputs[idx]?.text || ''}
            @input=${(e) => {
                state.clue_inputs[idx] = { text: e.target.value };
                state.update();
            }}
        />
        `);
    }
    if (state.game.settings.clue_mode !== 'text') {
        input.push(html`
        <input
            type="button"
            value="Draw it! (TODO)"
            disabled
        />
        `);
    }

    return html`
    <tr>
        <td>${idx + 1}.</td>
        <td>${state.game.in_game.keywords[idx]}</td>
        <td>${input}</td>
    </tr>
    `;
}

const renderClue = (state, clue) => {
    if ("text" in clue) {
        return html`<span class="clue clue-text">${clue.text}</span>`;
    } else {
        console.warn(`Clue not supported:`, clue);
        return html`<span class="clue">[Unsupported clue type]</span>`;
    }
}

const submitClues = (state) => {
    let data = [];
    for (let i = 0; i < state.clue_inputs.length; i+=1) {
        if (state.clue_inputs[i]?.text) {
            data.push({ text: state.clue_inputs[i].text });
        } else {
            // TODO: handle image clues, upload separately?
            console.warn(`Clue input ${i} is empty, skipping`);
        }
    }
    state.send({ submit_clues: data })
    state.clue_inputs = [];
}

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
        @click=${ () => state.send({ frustrated: {
            encrypting: ('waiting_for_encryptors' in state.game.in_game.inputs),
            teams: (
                ('waiting_for_encryptors' in state.game.in_game.inputs)
                ?   state.game.in_game.inputs.waiting_for_encryptors.teams
                :  state.game.in_game.inputs.waiting_for_guessers.teams
            )
        } }) }
    />
    `;
}

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
}

const parseGuess = (state, guess) => {
    guess = guess.trim();
    let parts = guess.split("-");
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
}

const renderDecipher = (state) => {
    let myTeam = state.game.players.find(p => p.id === state.user_info.id).team;

    const onKeyPress = (e) => {
        if (e.key === 'Enter') {
            let guess = parseGuess(state, e.target.value);
            if (guess === null) {
                e.target.setCustomValidity(e.target.title);
                e.target.reportValidity();
            } else {
                state.send({ submit_decipher: guess });
            }
        }
    };

    return html`
    <div class="input-action">
        <h1>Attempt to decipher your clues:</h1>
        <ul>
            ${
                state.game.in_game.current_round[+myTeam].clues === null
                ? html`<li>Encryptor ran out of time, no clues for you.</li>`
                : state.game.in_game.current_round[+myTeam].clues.map(clue => html`<li>${renderClue(state, clue)}</li>`)
            }
        </ul>
        <input
            type="text"
            placeholder="${[...Array(state.game.settings.clue_count).keys().map(i => i + 1)].join('-')}"
            required
            title="Enter your guess as a sequence of numbers, separated by dashes (e.g. 1-2-3)"
            .value=${state.decipher_input || ''}
            @input=${(e) => state.decipher_input = e.target.value}
            @keypress=${onKeyPress}
        >
    </div>
    `;
}

const renderIntercept = (state) => {
    let myTeam = state.game.players.find(p => p.id === state.user_info.id).team;

    const onKeyPress = (e) => {
        if (e.key === 'Enter') {
            let guess = parseGuess(state, e.target.value);
            if (guess === null) {
                e.target.setCustomValidity(e.target.title);
                e.target.reportValidity();
            } else {
                state.send({ submit_intercept: guess });
            }
        }
    };

    return html`
        <div class="input-action">
            <h1>Attempt interception:</h1>
            ${
                state.game.in_game.current_round[+myTeam].clues === null
                ? html`<li>Encryptor ran out of time, no clues for you.</li>`
                : state.game.in_game.current_round[+myTeam].clues.map(clue => html`<li>${renderClue(state, clue)}</li>`)
            }
            <input
                type="text"
                placeholder="${[...Array(state.game.settings.clue_count).keys().map(i => i + 1)].join('-')}"
                required
                title="Enter your guess as a sequence of numbers, separated by dashes (e.g. 1-2-3)"
                .value=${state.intercept_input || ''}
                @input=${(e) => state.intercept_input = e.target.value}
                @keypress=${onKeyPress}
            >
        </div>
        `;
}

const renderAction = (state) => {
    let myTeam = state.game.players.find(p => p.id === state.user_info.id).team;
    
    if ('encrypt' in state.game.in_game.inputs) {
        let code = state.game.in_game.inputs.encrypt.code;
        let deadline = state.game.in_game.inputs.encrypt.deadline;
        let disabled = Object.keys(state.clue_inputs).length !== code.length || state.clue_inputs.some(c => !c.text);
        return html`
        <div class="input-action">
            <h1>It's your turn to give clues!</h1>
            <div>
            Code: ${code.map((num) => num + 1).join('-')} (for ${code.map((num) => state.game.in_game.keywords[num]).join(', ')})
            </div>
            <table class="clue-inputs">
                ${code.map(num => renderClueInput(state, num))}
            </table>
            <input
                id="submit-clues"
                type="button"
                value="Proceed"
                ?disabled=${disabled}
                @click=${() => submitClues(state)}
            />
            ${renderDeadline(state, deadline)}
        </div>
        `;
    } else if ('guess' in state.game.in_game.inputs) {
        let intercept = state.game.in_game.inputs.guess.intercept;
        let decipher = state.game.in_game.inputs.guess.decipher;
        let deadline = state.game.in_game.inputs.guess.deadline;
        return html`${[
            decipher ? renderDecipher(state) : null,
            intercept ? renderIntercept(state) : null,
            deadline ? renderDeadline(state, deadline) : null, 
        ]}`;
    } else if ('waiting_for_encryptors' in state.game.in_game.inputs) {
        let waitingFor = state.game.in_game.inputs.waiting_for_encryptors.teams;
        let deadline = state.game.in_game.inputs.waiting_for_encryptors.deadline;
        let ourEncryptor = state.game.in_game.current_round[+myTeam].encryptor;
        let theirEncryptor = state.game.in_game.current_round[+!myTeam].encryptor;
        if (waitingFor[+myTeam] && waitingFor[+!myTeam]) {
            return html`
            <div class="input-action"><h1>
                Waiting for both teams to finish encrypting
                (${semantic.player(state, ourEncryptor)}, ${semantic.player(state, theirEncryptor) })...
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
    } else if ('waiting_for_guessers' in state.game.in_game.inputs) {
        let waitingFor = state.game.in_game.inputs.waiting_for_guessers.teams;
        let deadline = state.game.in_game.inputs.waiting_for_guessers.deadline;
        let waitText;
        if (waitingFor[+myTeam] && waitingFor[+!myTeam]) {
            waitText = "Waiting for both teams to finish guessing...";
        } else if (waitingFor[+myTeam]) {
            waitText = "Waiting for your team to finish guessing...";
        } else {
            waitText = "Waiting for the other team to finish guessing...";
        }
        return html`<div class="input-action"><h1>${waitText}</h1>${renderHurryUp(state, deadline)}</div>`;
    } else {
        return html`Error: unknown game state ???`;
    }
}

const renderInterceptionMatrix = (state, team) => {
    return html`
    <table class="matrix">
        <colgroup>
            <col class="col-round"/>
            <col span="${state.game.settings.keyword_count}" class="col-clue"/>
        </colgroup>
        <thead>
            <th>Round</th>
            ${Array(state.game.settings.keyword_count).keys().map(i => html`<th>${i + 1}</th>`)}
        </thead>
        <tbody>
            ${state.game.in_game.completed_rounds.map((round, index) => html`
                <tr>
                    <td>${semantic.round(state, index)}</td>
                    ${Array(state.game.settings.keyword_count).keys().map(i => {
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
                        return html`<td>${renderClue(state, clue)}</td>`;
                    })}
                </tr>
            `)}
        </tbody>
    </table>
    `;
}

const renderRoundHistory = state => {
    let myTeam = state.game.players.find(p => p.id === state.user_info.id).team;

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
            ${state.game.in_game.completed_rounds.map((round, index) => html`
                <tr>
                    <td>${semantic.round(state, index)}</td>
                    <td>${semantic.player(state, round[+myTeam].encryptor)}</td>
                    <td>${semantic.code(state, round[+myTeam].code, myTeam)}</td>
                    <td><div class="clues column">
                        ${
                            round[+myTeam].clues !== null
                            ? round[+myTeam].clues.map(clue => renderClue(state, clue))
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
                        ${
                            round[+!myTeam].clues !== null
                            ? round[+!myTeam].clues.map(clue => renderClue(state, clue))
                            : html`Timed out`
                        }
                    </div></td>
                    <td>
                        ${semantic.code(state, round[+!myTeam].decipher, !myTeam)}
                        <hr>
                        ${semantic.result(state, round[+!!myTeam].score.decipher)}
                    </td>
                    <td>
                        ${semantic.code(state, round[+!myTeam].intercept, !myTeam)}
                        <hr>
                        ${semantic.result(state, round[+!myTeam].score.intercept)}
                    </td>
                </tr>
            `)}
            <tr>
                <td>${semantic.round(state, state.game.in_game.completed_rounds.length)}</td>
                <td>${semantic.player(state, state.game.in_game.current_round[+myTeam].encryptor)}</td>
                <td>?</td>
                <td><div class="clues column">
                    ${state.game.in_game.current_round[+myTeam].clues?.map(clue =>
                        renderClue(state, clue)
                    )}
                </div></td>
                <td></td>
                <td></td>
                <td>${semantic.player(state, state.game.in_game.current_round[+!myTeam].encryptor)}</td>
                <td>?</td>
                <td><div class="clues column">
                    ${state.game.in_game.current_round[+!myTeam].clues?.map(clue =>
                        renderClue(state, clue)
                    )}
                </div></td>
                <td></td>
                <td></td>
            </tr>
        </tbody>
    </table>
    </div>
    `;
}

export default function viewInGame(state) {
    let myTeam = state.game.players.find(p => p.id === state.user_info.id).team;

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
