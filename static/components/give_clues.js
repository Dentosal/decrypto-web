import { LitElement, html, css } from 'https://unpkg.com/lit?module';
import { inputActionCSS } from './common.js';
import semantic from '../semantic.js';

class ClueGiverView extends LitElement {
    static properties = {
        state: { type: Object },
        clues: { type: Array },
        paintView: { type: Object },
    };

    constructor() {
        super();
        this.clues = [];
    }

    static get styles() {
        return [
            inputActionCSS,
            css`
            .clue-inputs {
                width: 100%;
            }
            `
        ];
    }

    connectedCallback() {
        super.connectedCallback();
        const codeLength = this.game.inputs.encrypt.code.length;
        this.clues = Array(codeLength).fill(null);
    }

    updateClue(index, clue) {
        this.clues[index] = clue;
        this.requestUpdate();
    }

    submitClues() {
        let data = [];
        for (let i = 0; i < this.clues.length; i += 1) {
            if (this.clues[i]?.text) {
                data.push({ text: this.clues[i].text });
            } else if (this.clues[i]?.drawing) {
                data.push({ drawing: this.clues[i].drawing });
            } else {
                console.error(`Clue input ${i} is empty, skipping`);
            }
        }

        this.dispatchEvent(new CustomEvent('send-cmd', {
            detail: { submit_clues: data },
            bubbles: true,
            composed: true,
        }));

        this.clues = [];
    }

    renderClueInput(keywordIndex, clueIndex) {
        const clue = this.clues[clueIndex];
        let input = [];

        if (clue?.drawing) {
            input.push(html`
                ${semantic.clueDrawing(this.state, clue.drawing)}
                <input
                    type="button"
                    value="Remove drawing"
                    @click=${() => {
                        this.updateClue(clueIndex, null);
                    }}
                />
            `);
        } else {
            if (this.game.settings.clue_mode !== 'draw') {
                input.push(html`
                <input
                    type="text"
                    placeholder="Clue"
                    .value=${clue?.text || ''}
                    @input=${(e) => {
                        this.updateClue(clueIndex, { text: e.target.value });
                    }}
                />
                `);
            }
            if (this.game.settings.clue_mode !== 'text') {
                input.push(html`
                <input
                    type="button"
                    value=${this.game.settings.clue_mode === 'either' ? "Draw it instead!?" : "Draw"}
                    @click=${() => {
                        this.updateClue(clueIndex, null);
                        this.paintView = {
                            clueIndex,
                            title: '' + (keywordIndex + 1) + '. ' + this.game.keywords[clueIndex],
                        };
                    }}
                />
                `);
            }
        }

        return html`
        <tr>
            <td>${keywordIndex + 1}.</td>
            <td>${this.game.keywords[clueIndex]}</td>
            <td class="row">${input}</td>
        </tr>
        `;
    }

    render() {
        const code = this.game.inputs.encrypt.code;
        const deadline = this.game.inputs.encrypt.deadline;
        const disabled = this.clues.length !== code.length || this.clues.some((c) => !c?.text && !c?.drawing);

        return html`
        <div class="input-action">
            <h1>It's your turn to give clues!</h1>
            <div>
                Code: ${code.map((num) => num + 1).join('-')} (for ${
                    code.map((num) => this.game.keywords[num]).join(', ')
                })
            </div>
            <table class="clue-inputs">
                ${code.map((keywordIndex, clueIndex) => this.renderClueInput(keywordIndex, clueIndex))}
            </table>
            <input
                id="submit-clues"
                type="button"
                value="Proceed"
                ?disabled=${disabled}
                @click=${() => this.submitClues()}
            />
            <deadline-display .game=${this.game} .deadline=${deadline}></deadline-display>
            ${this.paintView
                ? html`<paint-overlay
                    .gameId=${this.game.id}
                    @drawing-saved=${(e) => {
                        this.clues[this.paintView] = { drawing: e.detail };
                    }}
                >
                    <div>
                        <h2>${this.paintView.title}</h2>
                        <deadline-display .game=${this.game} .deadline=${deadline}></deadline-display>
                    </div>
                </paint-overlay>`
                : null
            }
        </div>
        `;
    }
}

customElements.define('clue-giver-view', ClueGiverView);
