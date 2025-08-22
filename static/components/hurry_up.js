import { LitElement, html, css } from 'https://unpkg.com/lit?module';

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
        if (this.deadline) {
            return null;
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
