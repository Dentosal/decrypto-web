import { LitElement, html, css } from 'https://unpkg.com/lit?module';
import { inputActionCSS } from './common.js';
import semantic from '../semantic.js';

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

    static get styles() {
        return [
            inputActionCSS,
            css`
            .row {
                display: flex;
                gap: 1rem;
                align-items: center;
            }
            `
        ];
    }

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
                ${this.state.game.inputs.tiebreaker.teams_done[+myTeam]
                ? html`
                    <div class="input-action">
                        <h1>${waitText}</h1>
                        <hurry-up-button .state=${this.state} .deadline=${this.deadline}></hurry-up-button>
                    </div>
                `
                : ''
        }
            </div>
        `;
    }
}

customElements.define('tiebreaker-view', TiebreakerView);
