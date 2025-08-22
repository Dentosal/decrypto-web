import { LitElement, html } from 'https://unpkg.com/lit?module';
import { inputActionCSS } from './common.js';
import semantic from '../semantic.js';

class DecipherView extends LitElement {
    static properties = {
        game: { type: Object },
        user_info: { type: Object },
        value: { type: String },
    };

    constructor() {
        super();
        this.value = '';
    }

    static get styles() {
        return [
            inputActionCSS,
        ];
    }

    parseGuess(guess) {
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
        const myTeam = this.game.players.find((p) => p.id === this.user_info.id).team;
        return html`
            <div class="input-action">
                <h1>Attempt to decipher your clues:</h1>
                <ul>${this.game.current_round[+myTeam].clues === null
                    ? html`<li>Encryptor ran out of time, no clues for you.</li>`
                    : this.game.current_round[+myTeam].clues.map((clue) => html`<li>${semantic.clue(this.state, clue)}</li>`)
                }</ul>
                <input
                    type="text"
                    placeholder="${
                        [...Array(this.game.settings.clue_count).keys().map((i) => i + 1)].join('-')
                    }"
                    required
                    title="Enter your guess as a sequence of numbers, separated by dashes (e.g. 1-2-3)"
                    .value=${this.value}
                    @input=${(e) => this.value = e.target.value}
                    @keypress=${this.handleKeyPress.bind(this)}
                >
            </div>
        `;
    }
}

customElements.define('decipher-view', DecipherView);
