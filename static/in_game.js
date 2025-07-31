import { html } from 'https://unpkg.com/lit-html?module';

const renderKeywords = (state) => {
    return html`
    <div class="row keywords">
        ${state.game.in_game.keywords.map((keyword, index) => html`
            <div class="keyword">${index + 1}. ${keyword}</div>
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
            @input=${(e) => state.clue_inputs[idx] = { text: e.target.value }}
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
        <td>${idx + 1}</td>
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

    console.log("Submitting clues:", data);
    if (data.length === 0) { // XXX: dev mode: submit keywords as clues
        for (let code_part of state.game.in_game.inputs.encrypt) {
            data.push({text : state.game.in_game.keywords[code_part]});
        }
        console.warn("Clues empty, submitting keywords instead:", data);
    }
    state.send({ submit_clues: data })
}

const renderHurryUp = state => {
    return html`
    <input
        type="button"
        value="Hurry up!"
        @click=${ () => state.send({ frustrated: state.game.in_game.phase }) }
    />
    `;
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
    <div>
        <p>Attempt to decipher your clues:</p>
        <ul>
            ${state.game.in_game.current_round[+myTeam].clues.map(clue => html`<li>${renderClue(state, clue)}</li>`)}
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
        <div>
            <p>Attempt interception:</p>
            <ul>
                ${state.game.in_game.current_round[+!myTeam].clues.map(clue => html`<li>${renderClue(state, clue)}</li>`)}
            </ul>
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
    // State cleanup
    if (state.game.in_game.phase !== 'encrypt') {
        state.clue_inputs = [];
    };
    if (state.game.in_game.phase !== 'decipher') {
        state.decipher_input = '';
    };
    if (state.game.in_game.phase !== 'intercept') {
        state.intercept_input = '';
    };

    let myTeam = state.game.players.find(p => p.id === state.user_info.id).team;
    
    if ('encrypt' in state.game.in_game.inputs) {
        let code = state.game.in_game.inputs.encrypt;
        return html`
        <div>
            <p>It's your turn to give clues!</p>
            <div>
            Code: ${code.map((num) => num + 1).join('-')} (for ${code.map((num) => state.game.in_game.keywords[num]).join(', ')})
            </div>
            <table>
                ${code.map(num => renderClueInput(state, num))}
            </table>
            <input
                type="button"
                value="Proceed"
                @click=${() => submitClues(state)}
            />
        </div>
        `;
    } else if ('guess' in state.game.in_game.inputs) {
        let intercept = state.game.in_game.inputs.guess.intercept;
        let decipher = state.game.in_game.inputs.guess.decipher;    
        return html`${[
            decipher ? renderDecipher(state) : null,
            intercept ? renderIntercept(state) : null
        ]}`;
    } else if ('waiting_for_encryptors' in state.game.in_game.inputs) {
        let waitingFor = state.game.in_game.inputs.waiting_for_encryptors;
        let ourEncryptor = state.game.in_game.current_round[+myTeam].encryptor;
        let theirEncryptor = state.game.in_game.current_round[+!myTeam].encryptor;
        let ourEncryptorName = state.game.players.find(p => p.id === ourEncryptor)?.nick;
        let theirEncryptorName = state.game.players.find(p => p.id === theirEncryptor)?.nick;
        let ourMention = html`<span x-mention="${ourEncryptor}">${ourEncryptorName}</span>`;
        let theirMention = html`<span x-mention="${theirEncryptor}">${theirEncryptorName}</span>`;
        if (waitingFor[+myTeam] && waitingFor[+!myTeam]) {
            return html`<p>Waiting for both teams to finish encrypting (${ourMention}, ${theirMention})...</p>`;
        } else if (waitingFor[+myTeam]) {
            return html`<p>Waiting for your team to finish encrypting (${ourMention})...</p>`;
        } else {
            return html`<p>Waiting for the other team to finish encrypting (${theirMention})...</p>`;
        }
    } else if ('waiting_for_guessers' in state.game.in_game.inputs) {
        let waitingFor = state.game.in_game.inputs.waiting_for_guessers;
        if (waitingFor[+myTeam] && waitingFor[+!myTeam]) {
            return html`<p>Waiting for both teams to finish guessing...</p>`;
        } else if (waitingFor[+myTeam]) {
            return html`<p>Waiting for your team to finish guessing...</p>`;
        } else {
            return html`<p>Waiting for the other team to finish guessing...</p>`;
        }
    } else {
        return html`Error: unknown game state ???`;
    }
}

const renderInterceptionMatrix = (state, team) => {
    return html`
    <table class="history">
        <colgroup>
            <col class="col-round"/>
            <col class="col-encryptor"/>
            <col span="${state.game.settings.keyword_count}" class="col-clue"/>
        </colgroup>
        <thead>
            <th>Round</th>
            <th>Encryptor</th>
            ${Array(state.game.settings.keyword_count).keys().map(i => html`<th>${i + 1}</th>`)}
        </thead>
        <tbody>
            ${state.game.in_game.completed_rounds.map((round, index) => html`
                <tr>
                    <td>${index + 1}</td>
                    <td>${state.game.players.find(p => p.id == round[+team].encryptor).nick}</td>
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


export default function viewInGame(state) {
    return html`
    <div id="in_game">
        ${renderKeywords(state)}
        ${renderAction(state)}
        ${renderInterceptionMatrix(state, false)}
        ${renderInterceptionMatrix(state, true)}
        <pre><code>${JSON.stringify(state.game, null, 2)}</code></pre>
    <div>
    `;
}
