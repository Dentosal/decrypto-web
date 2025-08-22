import { LitElement, html, css } from 'https://unpkg.com/lit?module';
import semantic from './semantic.js';

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

class DecipherView extends LitElement {
    static properties = {
        state: { type: Object },
    };

    static styles = css`
        .input-action {
            padding: 10px;
            background-color: #f9f9f9;
            border-radius: 5px;
        }
        .input-action h1 {
            margin: 0;
            font-size: 1.2em;
        }
    `;

    parseGuess(guess) {
        const { state } = this;
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
    }

    handleKeyPress(e) {
        if (e.key === 'Enter') {
            let guess = this.parseGuess(e.target.value);
            if (guess === null) {
                e.target.setCustomValidity(e.target.title);
                e.target.reportValidity();
            } else {
                this.dispatchEvent(new CustomEvent('send-cmd', {
                    detail: { submit_decipher: guess },
                    bubbles: true,
                    composed: true,
                }));
            }
        }
    }

    render() {
        const myTeam = this.state.game.players.find((p) => p.id === this.state.user_info.id).team;
        return html`
            <div class="input-action">
                <h1>Attempt to decipher your clues:</h1>
                <ul>
                    ${
            this.state.game.current_round[+myTeam].clues === null
                ? html`<li>Encryptor ran out of time, no clues for you.</li>`
                : this.state.game.current_round[+myTeam].clues.map((clue) => html`<li>${semantic.clue(this.state, clue)}</li>`)
        }
                </ul>
                <input
                    type="text"
                    placeholder="${
            [...Array(this.state.game.settings.clue_count).keys().map((i) => i + 1)].join('-')
        }"
                    required
                    title="Enter your guess as a sequence of numbers, separated by dashes (e.g. 1-2-3)"
                    .value=${this.state.decipher_input || ''}
                    @input=${(e) => this.state.decipher_input = e.target.value}
                    @keypress=${this.handleKeyPress.bind(this)}
                >
            </div>
        `;
    }
}

customElements.define('decipher-view', DecipherView);

class InterceptView extends LitElement {
    static properties = {
        state: { type: Object },
    };

    static styles = css`
        .input-action {
            padding: 10px;
            background-color: #f9f9f9;
            border-radius: 5px;
        }
        .input-action h1 {
            margin: 0;
            font-size: 1.2em;
        }
    `;

    parseGuess(guess) {
        const { state } = this;
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
    }

    handleKeyPress(e) {
        if (e.key === 'Enter') {
            let guess = this.parseGuess(e.target.value);
            if (guess === null) {
                e.target.setCustomValidity(e.target.title);
                e.target.reportValidity();
            } else {
                this.state.send({ submit_intercept: guess });
            }
        }
    }

    render() {
        const myTeam = this.state.game.players.find((p) => p.id === this.state.user_info.id).team;
        return html`
            <div class="input-action">
                <h1>Attempt interception:</h1>
                ${
            this.state.game.current_round[+!myTeam].clues === null
                ? html`<li>Encryptor ran out of time, nothing to intercept.</li>`
                : this.state.game.current_round[+!myTeam].clues.map((clue) => html`<li>${semantic.clue(this.state, clue)}</li>`)
        }
                <input
                    type="text"
                    placeholder="${
            [...Array(this.state.game.settings.clue_count).keys().map((i) => i + 1)].join('-')
        }"
                    required
                    title="Enter your guess as a sequence of numbers, separated by dashes (e.g. 1-2-3)"
                    .value=${this.state.intercept_input || ''}
                    @input=${(e) => this.state.intercept_input = e.target.value}
                    @keypress=${this.handleKeyPress.bind(this)}
                >
            </div>
        `;
    }
}

customElements.define('intercept-view', InterceptView);

const renderDecipher = (state) => {
    return html`<decipher-view .state=${state}></decipher-view>`;
};

const renderIntercept = (state) => {
    return html`<intercept-view .state=${state}></intercept-view>`;
};

const inputActionCSS = css`
.input-action {
    padding: 10px;
    background-color: #f9f9f9;
    border-radius: 5px;
}
.input-action h1 {
    margin: 0;
    font-size: 1.2em;
}
`;

class TiebreakerInput extends LitElement {
    static properties = {
        index: { type: Number },
        value: { type: String },
        submitted: { type: Object },
    };

    constructor() {
        super();
        this.value = '';
        this.submitted = null;
    }

    static styles = css`
        .row {
            display: flex;
            gap: 1rem;
            align-items: center;
        }
    `;

    handleInput(e) {
        this.value = e.target.value;
        this.dispatchEvent(new CustomEvent('tiebreaker-input', {
            detail: { index: this.index, value: this.value },
            bubbles: true,
            composed: true,
        }));
    }

    handleKeyPress(e) {
        if (e.key === 'Enter') {
            let guess = e.target.value.trim();
            if (guess.length > 0) {
                this.dispatchEvent(new CustomEvent('submit-tiebreaker', {
                    detail: { index: this.index, guess },
                    bubbles: true,
                    composed: true,
                }));
            }
        }
    }

    render() {
        if (this.submitted) {
            return html`
            <div class="row">
                <div>${this.index + 1}.</div>
                <div class="tiebreaker-guess">${this.submitted.guess}</div>
                <div class="tiebreaker-is-correct">${this.submitted.is_correct ? 'correct' : 'incorrect'}</div>
                <div class="tiebreaker-correct-answer">${this.submitted.correct}</div>
            </div>
            `;
        }
        return html`
        <div class="row">
            <td>${this.index + 1}.</td>
            <td><input
                type="text"
                placeholder="Guess keyword"
                .value=${this.value}
                @input=${this.handleInput}
                @keypress=${this.handleKeyPress}
            /></td>
            <td></td>
            <td></td>
        </div>
        `;
    }
}

customElements.define('tiebreaker-input', TiebreakerInput);

class TiebreakerView extends LitElement {
    static properties = {
        state: { type: Object },
        deadline: { type: Object },
    };

    static get styles() {
        return [
            inputActionCSS,
            css`
            .tiebreaker-inputs {
                display: flex;
                flex-direction: column;
                flex-wrap: wrap;
                gap: 1rem;
            }
            `
        ];
    }

    handleInput(e) {
        const { index, value } = e.detail;
        this.state.tiebreaker_inputs[index] = value;
        this.state.update();
    }

    handleSubmit(e) {
        const { index, guess } = e.detail;
        this.state.send({ submit_tiebreaker: { index, guess } });
    }

    renderInputs() {
        const myTeam = this.state.game.players.find((p) => p.id === this.state.user_info.id).team;
        const inputs = [];

        for (let i = 0; i < this.state.game.settings.keyword_count; i++) {
            const submitted = this.state.game.inputs.tiebreaker.submitted[+myTeam][i];
            inputs.push(html`
                <tiebreaker-input
                    .index=${i}
                    .value=${this.state.tiebreaker_inputs?.[i] || ''}
                    .submitted=${submitted}
                    @tiebreaker-input=${this.handleInput.bind(this)}
                    @submit-tiebreaker=${this.handleSubmit.bind(this)}
                ></tiebreaker-input>
            `);
        }

        return inputs;
    }

    render() {
        const myTeam = this.state.game.players.find((p) => p.id === this.state.user_info.id).team;
        const waitText = 'Waiting for the other team to finish the tiebreaker...';

        return html`
            <div class="tiebreaker-container input-action">
                <h1>Tiebreaker!</h1>
                <p>Guess the keywords of the other team:</p>
                <div class="tiebreaker-inputs">
                    ${this.renderInputs()}
                </div>
                ${
            this.state.game.inputs.tiebreaker.teams_done[+myTeam]
                ? html`<div class="input-action"><h1>${waitText}</h1>${renderHurryUp(this.state, this.deadline)}</div>`
                : ''
        }
            </div>
        `;
    }
}

customElements.define('tiebreaker-view', TiebreakerView);

const renderTiebreaker = (state, deadline) => {
    return html`
        <tiebreaker-view
            .state=${state}
            .deadline=${deadline}
        ></tiebreaker-view>
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
