import { LitElement, html, css } from 'https://unpkg.com/lit?module';
import semantic from './semantic.js';

class HurryUpButton extends LitElement {
    static properties = {
        state: { type: Object },
        deadline: { type: Object },
    };

    handleClick() {
        const { state } = this;
        state.send({
            frustrated: {
                encrypting: ('waiting_for_encryptors' in state.game.inputs),
                teams: (
                    ('waiting_for_encryptors' in state.game.inputs)
                        ? state.game.inputs.waiting_for_encryptors.teams
                        : state.game.inputs.waiting_for_guessers.teams
                ),
            },
        });
    }

    render() {
        if (this.deadline !== null) {
            return html`<deadline-display .deadline=${this.deadline}></deadline-display>`;
        }
        return html`
        <input
            type="button"
            value="Hurry up!"
            @click=${this.handleClick}
        />
        `;
    }
}

customElements.define('hurry-up-button', HurryUpButton);

class DeadlineDisplay extends LitElement {
    static properties = {
        deadline: { type: Object },
    };

    static styles = css`
        .deadline {
            font-weight: bold;
        }
    `;

    render() {
        if (this.deadline) {
            return html`
            <div
                class="deadline"
                x-deadline="${this.deadline.at}"
            >
                Deadline <span class="seconds-left"></span> seconds (${this.deadline.reason})
            </div>
            `;
        }
        return null;
    }
}

customElements.define('deadline-display', DeadlineDisplay);
