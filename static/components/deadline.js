import { LitElement, html, css } from 'https://unpkg.com/lit?module';

class DeadlineDisplay extends LitElement {
    static properties = {
        deadline: { type: Object },
    };

    static styles = css`
        .deadline {
            font-weight: bold;
        }
    `;

    connectedCallback() {
        super.connectedCallback();
        this._interval = setInterval(() => this.updateSecondsLeft(), 1000);
    }

    disconnectedCallback() {
        clearInterval(this._interval);
        super.disconnectedCallback();
    }

    secondsLeft() {
        return Math.floor((parseInt(this.deadline.at) - Date.now()) / 1000);
    }
    
    updateSecondsLeft() {
        const deadlineElement = this.shadowRoot.querySelector('.seconds-left');
        if (this.deadline && deadlineElement) {
            let secondsLeft = this.secondsLeft();
            deadlineElement.innerText = secondsLeft;
            if (secondsLeft < 0) {
                secondsLeft = 0;
                let inputs = state.game?.in_game?.inputs;
                if (inputs !== null) {
                    state.send({ trigger_timers: null });
                }
            }
        }
    }

    render() {
        if (this.deadline) {
            let secondsLeft = this.secondsLeft();
            return html`
            <div class="deadline">
                Deadline <span class="seconds-left">${secondsLeft}</span> seconds (${this.deadline.reason})
            </div>
            `;
        }
        return null;
    }
}

customElements.define('deadline-display', DeadlineDisplay);
