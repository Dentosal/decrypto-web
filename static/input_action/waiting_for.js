import { LitElement, html } from 'https://unpkg.com/lit?module';
import { inputActionCSS } from './common.js';

class WaitingFor extends LitElement {
    static properties = {
        state: { type: Object },
        deadline: { type: String },
    };

    static get styles() {
        return [
            inputActionCSS,
        ];
    }

    render() {
        return html`
        <div class="waiting input-action">
            <h1><slot></slot></h1>
            <hurry-up-button .state=${this.state} .deadline=${this.deadline}></hurry-up-button>
        </div>
        <deadline-display .deadline=${this.deadline}></deadline-display>
        `;
    }
}

customElements.define('waiting-for', WaitingFor);