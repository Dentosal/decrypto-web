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
    }

    static get styles() {
        return [
            css`
            .row {
                display: flex;
                gap: 1rem;
                align-items: center;
            }
            `
        ];
    }

    handleKeyPress(e) {
        if (e.key === 'Enter') {
            let guess = e.target.value.trim();
            if (guess.length > 0) {
                this.dispatchEvent(new CustomEvent('submit', {
                    detail: { index: this.index, guess },
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
            <td>${this.index + 1}. ${JSON.stringify(this.submitted)}</td>
            <td><input
                type="text"
                placeholder="Guess keyword"
                .value=${this.value}
                @input=${(e) => {
                    this.value = e.target.value;
                }}
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


    handleSubmit(e) {
        const { index, guess } = e.detail;
        this.state.send({ submit_tiebreaker: { index, guess } });
    }

    renderInputs() {
        const myTeam = this.state.game.players.find((p) => p.id === this.state.user_info.id).team;
        const inputs = [];

        for (let i = 0; i < this.state.game.settings.keyword_count; i += 1) {
            const submitted = this.state.game.inputs.tiebreaker.submitted[+myTeam][i];
            console.log('rendering tiebreaker input', i, myTeam, submitted);
            inputs.push(html`
                <tiebreaker-input
                    .index=${i}
                    .submitted=${submitted}
                    @submit=${e => this.handleSubmit(e)}
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
