import { LitElement, html } from 'https://unpkg.com/lit?module';
import { inputActionCSS } from './common.js';
import semantic from '../semantic.js';

class InterceptView extends LitElement {
    static properties = {
        state: { type: Object },
    };

    static get styles() {
        return [
            inputActionCSS,
        ];
    }

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
