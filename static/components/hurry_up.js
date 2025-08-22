import { LitElement, html, css } from 'https://unpkg.com/lit?module';

class HurryUpButton extends LitElement {
    static properties = {
        game: { type: Object },
        deadline: { type: Object },
    };

    handleClick() {
        this.dispatchEvent(new CustomEvent('send-cmd', {
            detail: {
                frustrated: {
                    encrypting: ('waiting_for_encryptors' in this.game.inputs),
                    teams: (
                        ('waiting_for_encryptors' in this.game.inputs)
                            ? this.game.inputs.waiting_for_encryptors.teams
                            : this.game.inputs.waiting_for_guessers.teams
                    ),
                } },
            bubbles: true,
            composed: true,
        }));
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
