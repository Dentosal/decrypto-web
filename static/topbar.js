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
    return html`
    <div id="topbar" style="gap: 1rem;">
        <div>Dentocrypto</div>
        <div class="spacer"></div>
        <div><input type="button" value="Reload CSS" @click=${_ => devReloadCSS()}></div>
        <div>Nick: ${state.user_info.nick} <input type="button" value="✎" @click=${_ => resetNick(state)}></div>
    </div>
    `;
}
