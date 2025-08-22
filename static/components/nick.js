import { html, LitElement } from 'https://unpkg.com/lit?module';

class NicknameInput extends LitElement {
    static properties = {
        nickname: { type: String },
    };

    constructor() {
        super();
        this.value = '';
    }

    handleInput(e) {
        this.value = e.target.value;
    }

    handleKeyPress(e) {
        if (e.key === 'Enter') {
            this.dispatchEvent(new CustomEvent('set', {
                detail: this.value,
                bubbles: true,
                composed: true,
            }));
        }
    }

    firstUpdated() {
        this.shadowRoot.getElementById('nick-input')?.focus();
    }

    render() {
        return html`
            <div id="nick-required" style="margin: 1rem;">
                <p>Select a nickname:</p>
                <input
                    id="nick-input"
                    type="text"
                    placeholder="Nickname"
                    .value=${this.value}
                    @input=${this.handleInput}
                    @keypress=${this.handleKeyPress}
                />
            </div>
        `;
    }
}

customElements.define('nickname-input', NicknameInput);