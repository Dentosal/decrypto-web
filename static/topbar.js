import { html } from 'https://unpkg.com/lit-html?module';

const devReloadCSS = () => {
    var links = document.getElementsByTagName("link");
    for (var i = 0; i < links.length; i++) {
        let link = links[i];
        if (link.rel === "stylesheet") { link.href += "?" + Math.random().toString(16).slice(2); }
    }
}

const resetNick = state => {
    state.nickname_input = '';
    state.override_view = 'nick_required';
    state.update();
}

export default function topbar(state) {
    const isLocalhost = (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '[::1]' ||
        !!window.location.hostname.match(
            /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
        )
    );


    return html`
    <div id="topbar" style="gap: 1rem;">
        <div>Dentocrypto</div>
        <div class="version">
            ${state.version ? html`${state.version.crate}` : null}
            ${state.version?.git ? html`(${state.version.git.slice(0, 8)})` : null}
        </div>
        <div class="rule-links">
            How to play
            [<a target="_blank" href="https://www.youtube.com/watch?v=2DBg7Z2-pQ4&t=114s">video</a>]
            [<a target="_blank" href="http://www.scorpionmasque.com/sites/scorpionmasque.com/files/decrypto_en_rules_20sep2019.pdf">rules</a>]
        </div>
        <div class="spacer"></div>
        ${isLocalhost
            ? html`<div><input type="button" value="Reload CSS" @click=${_ => devReloadCSS()}></div>`
            : null
        }
        ${
            state.user_info?.nick
            ? html`<div>Nick: ${state.user_info.nick} <input type="button" value="✎" @click=${_ => resetNick(state)}></div>`
            : html`<div>Nick not set</div>`
        }
    </div>
    `;
}
