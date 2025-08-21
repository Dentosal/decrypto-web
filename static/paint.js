import { css, html, LitElement } from 'https://unpkg.com/lit?module';

const width = 800;
const height = 600;

const saveDrawing = async (canvas, gameId) => {
    canvas.toBlob((img) => {
        if (img) {
            fetch('/drawing/' + gameId, {
                method: 'POST',
                body: img,
                headers: {
                    'Content-Type': 'image/png',
                },
            });
        } else {
            console.error('Failed to create image blob');
        }
    });
};

const dist = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

// Flood fill, partially ChatGPT-written to match what real paint programs do
const floodFill = (ctx, startX, startY, fillColor, tolerance = 50, expand = 1) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const toIndex = (x, y) => (y * width + x) * 4;

    // Target color at clicked point
    const sx = Math.floor(startX), sy = Math.floor(startY);
    const tIndex = toIndex(sx, sy);
    const targetR = data[tIndex], targetG = data[tIndex + 1], targetB = data[tIndex + 2];

    // Fill color (hex → RGB)
    const fillR = parseInt(fillColor.slice(1, 3), 16);
    const fillG = parseInt(fillColor.slice(3, 5), 16);
    const fillB = parseInt(fillColor.slice(5, 7), 16);

    // Masks
    const mask = new Uint8Array(width * height); // inside tolerance
    const expanded = new Uint8Array(width * height); // expanded edge

    const colorDiff = (i) =>
        Math.abs(data[i] - targetR) +
        Math.abs(data[i + 1] - targetG) +
        Math.abs(data[i + 2] - targetB);

    // 1. Flood fill to build base mask
    const stack = [{ x: sx, y: sy }];
    while (stack.length) {
        const { x, y } = stack.pop();
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const key = y * width + x;
        if (mask[key]) continue;

        const idx = toIndex(x, y);
        if (colorDiff(idx) > tolerance) continue;

        mask[key] = 1;
        stack.push({ x: x + 1, y });
        stack.push({ x: x - 1, y });
        stack.push({ x, y: y + 1 });
        stack.push({ x, y: y - 1 });
    }

    // 2. Expand mask outward
    if (expand > 0) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (!mask[idx]) {
                    if (
                        (x > 0 && mask[idx - 1]) ||
                        (x < width - 1 && mask[idx + 1]) ||
                        (y > 0 && mask[idx - width]) ||
                        (y < height - 1 && mask[idx + width])
                    ) {
                        expanded[idx] = 1; // edge pixel
                    }
                }
            }
        }
    }

    // 3. Apply fill color
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = toIndex(x, y);

            if (mask[y * width + x]) {
                // Solid fill for base region
                data[idx] = fillR;
                data[idx + 1] = fillG;
                data[idx + 2] = fillB;
                data[idx + 3] = 255;
            } else if (expanded[y * width + x]) {
                // Blended fill for edges
                data[idx] = Math.round((data[idx] + fillR) / 2);
                data[idx + 1] = Math.round((data[idx + 1] + fillG) / 2);
                data[idx + 2] = Math.round((data[idx + 2] + fillB) / 2);
                data[idx + 3] = 255;
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
};

class PaintOverlay extends LitElement {
    static properties = {
        gameId: { type: String },
        tool: { type: String },
        brushSize: { type: Number },
        currentColor: { type: String },
    };

    constructor() {
        super();
        this.tool = 'pen';
        this.brushSize = 10;
        this.currentColor = '#000000';
        this.colorHistory = [
            '#ffffff',
            '#000000',
            '#ff0000',
            '#00ff00',
            '#0000ff',
            '#ffff00',
            '#ff00ff',
            '#00ffff',
            '#808080',
            '#800000',
        ];
        this.drawHistory = [];
        this.redoStack = []; // Redo entries, in reverse order
    }

    static styles = css`
        .row {
            display: flex;
            flex-direction: row;
            justify-content: space-around;
            gap: 10px;
            width: 100%;
        }

        .column {
            display: flex;
            flex-direction: column;
            justify-content: space-around;
            gap: 10px;
            width: 100%;
        }

        .color-box {
            display: inline-block;
            width: 25px;
            height: 25px;
            border: 1px solid black;
            cursor: pointer;
        }

        .paint-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;

            justify-content: center;
            gap: 0;
        }

        input[x-active="true"] {
            background-color: #ddd;
        }

        .paint-overlay .toolbox {
            align-items: flex-start;
            justify-content: flex-start;
            background-color: #ccd;
            max-width: 200px;
            padding: 10px;
            gap: 10px;
            
            & > .row {
                justify-content: space-around;
                align-items: center;
                
                & > * {
                    text-align: center;
                }

                & .tool {
                    flex:1;
                }
            }

            & .color-current {
                flex: initial;
                width: 50px;
                border: 1px solid black;
                cursor: pointer;
            }
            
            & .color-history input {
                height: 25px;
                width: 25px;
                border: 1px solid black;
                margin: 2px;
                padding: 2px;
                cursor: pointer;
            }
        }
    `;

    render() {
        return html`
        <div class="paint-overlay row">
            <div class="toolbox column">
                <div class="row">
                    <input type="color" class="color-current"
                        .value="${this.currentColor}"
                        @input=${(e) => {
            this.currentColor = e.target.value;
        }}
                    />
                    <div class="color-history">
                        ${
            this.colorHistory.map((color, i) =>
                html`<div class="color-box"
                            x-value="${color}"
                            style="background-color: ${color};"
                            @click=${(e) => {
                    this.currentColor = e.target.getAttribute('x-value');
                    this.colorHistory.unshift(this.colorHistory.splice(i, 1)[0]);
                    e.preventDefault();
                    return false;
                }}/>`
            )
        }
                    </div>
                </div>
                <input type="range" class="brush-size" min="1" max="100"
                    .value="${this.brushSize}" @input=${(e) => this.brushSize = e.target.value}/>
                <div class="row wrap">
                    <input type="button" class="tool pen" value="Pen"
                        x-active=${this.tool === 'pen'}
                        @click=${(e) => this.tool = 'pen'}
                    />
                    <input type="button" class="tool eraser" value="Eraser"
                        x-active=${this.tool === 'eraser'}
                        @click=${(e) => this.tool = 'eraser'}
                    />
                </div>
                <div class="row wrap">
                    <input type="button" class="tool straight-line" value="Line"
                        x-active=${this.tool === 'line'}
                        @click=${(e) => this.tool = 'line'}
                    />
                    <input type="button" class="tool fill" value="Bucket"
                        x-active=${this.tool === 'bucket'}
                        @click=${(e) => this.tool = 'bucket'}
                    />
                </div>
                <div class="row wrap">
                    <input type="button" class="tool undo" value="Undo" ?disabled=${this.drawHistory.length === 0}
                        @click=${(e) => {
            this.redoStack.push(this.drawHistory.pop());
            this.resetCanvasSnapshot();
            this.redraw();
            this.requestUpdate();
        }}
                    />
                    <input type="button" class="tool redo" value="Redo" ?disabled=${this.redoStack.length === 0}
                        @click=${(e) => {
            this.drawHistory.push(this.redoStack.pop());
            this.redraw();
            this.requestUpdate();
        }}
                    />
                </div>
                <div class="row wrap">
                    <input type="button" class="tool clear" value="Clear"
                        @click=${(e) => {
            this.drawHistory = [];
            this.redoStack = [];
            this.redraw();
            this.requestUpdate();
        }}
                    />
                    <input type="button" class="tool save" value="Save"
                        @click=${(e) => {
            saveDrawing(this.canvas, this.gameId);
        }}
                    />
                </div>
            </div>
            <canvas
                width="${width}"
                height="${height}"
                @mousedown=${this.mousedown}
                @mousemove=${this.mousemove}
                @mouseenter=${this.mouseenter}
                @mouseleave=${this.mouseleave}
                @mouseup=${this.mouseup}
            ></canvas>
        </div>
        `;
    }

    cursorPos(e) {
        const rect = this.canvas.getBoundingClientRect();

        const xCss = e.clientX - rect.left;
        const yCss = e.clientY - rect.top;

        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const x = xCss * scaleX;
        const y = yCss * scaleY;

        return { x, y };
    }

    firstUpdated() {
        this.canvas = this.renderRoot.querySelector('canvas');
        this.ctx = this.canvas.getContext('2d');

        // Snapshot is optimization for event-sourced drawHistory,
        // so we don't have to redraw the entire canvas every time.
        this.snapshot = {};
        this.snapshot.canvas = new OffscreenCanvas(this.canvas.width, this.canvas.height);
        this.snapshot.ctx = this.snapshot.canvas.getContext('2d');
        this.snapshot.at = -1;

        this.redraw();
    }

    drawItem(ctx, h) {
        if (h.type === 'pen' || h.type === 'line') {
            ctx.strokeStyle = h.color;
            ctx.lineWidth = h.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(h.points[0].x, h.points[0].y);
            for (let i = 1; i < h.points.length; i++) {
                ctx.lineTo(h.points[i].x, h.points[i].y);
            }
            ctx.stroke();
        } else if (h.type === 'bucket') {
            floodFill(ctx, h.point.x, h.point.y, h.color);
        } else {
            console.error('Unknown draw history type:', h.type);
        }
    }

    resetCanvasSnapshot() {
        this.snapshot.at = -1;
    }

    redraw() {
        // Cache everything before the last item in the snapshot
        if (this.snapshot.at === -1) {
            this.snapshot.ctx.fillStyle = '#ffffff';
            this.snapshot.ctx.fillRect(0, 0, width, height);
        }
        for (let i = this.snapshot.at + 1; i < this.drawHistory.length - 1; i += 1) {
            this.drawItem(this.snapshot.ctx, this.drawHistory[i]);
        }
        this.ctx.drawImage(this.snapshot.canvas, 0, 0);
        if (this.drawHistory.length > 0) {
            this.drawItem(this.ctx, this.drawHistory[this.drawHistory.length - 1]);
        }
    }

    colorUsed() {
        let i = this.colorHistory.indexOf(this.currentColor);
        if (i === -1) {
            this.colorHistory.unshift(this.currentColor);
            this.colorHistory = this.colorHistory.slice(0, 10);
        } else {
            this.colorHistory.unshift(this.colorHistory.splice(i, 1)[0]);
        }
    }

    mousedown(e) {
        if (e.buttons !== 1) {
            return;
        }
        this.redoStack = []; // Clear redo stack on new action
        if (this.tool == 'pen') {
            this.drawHistory.push({
                type: 'pen',
                color: this.currentColor,
                size: this.brushSize,
                points: [this.cursorPos(e)],
            });

            this.colorUsed();
        } else if (this.tool == 'eraser') {
            this.drawHistory.push({
                type: 'pen',
                color: '#ffffff',
                size: this.brushSize,
                points: [this.cursorPos(e)],
            });
        } else if (this.tool == 'line') {
            this.drawHistory.push({
                type: 'line',
                color: this.currentColor,
                size: this.brushSize,
                points: [this.cursorPos(e)],
            });
        } else if (this.tool == 'bucket') {
            const p = this.cursorPos(e);
            this.drawHistory.push({
                type: 'bucket',
                color: this.currentColor,
                point: this.cursorPos(e),
            });
            this.colorUsed();
            this.redraw();
        }
        this.requestUpdate();
    }

    mousemove(e) {
        if (e.buttons !== 1) {
            return;
        }
        if (this.tool == 'pen' || this.tool == 'eraser') {
            let h = this.drawHistory.at(-1);
            let p = this.cursorPos(e);
            if (dist(p, h.points.at(-1)) >= 1.0) {
                h.points.push(p);
                this.redraw();
            }
        } else if (this.tool == 'line') {
            let h = this.drawHistory.at(-1);
            let p = this.cursorPos(e);
            if (dist(p, h.points.at(-1)) >= 1.0) {
                h.points[1] = p;
                this.redraw();
            }
        }
    }

    mouseenter(e) {
        // TODO: handle leave/re-enter
    }

    mouseleave(e) {
        // TODO: handle leave/re-enter
    }

    mouseup(e) {
        if (e.buttons !== 1) {
            return;
        }
        this.redoStack = []; // Clear redo stack on new action
        this.requestUpdate();
    }
}

customElements.define('paint-overlay', PaintOverlay);

export default function paint(gameId) {
    return html`<paint-overlay .gameId=${gameId}></paint-overlay>`;
}
