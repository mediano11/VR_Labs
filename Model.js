

function deg2rad(angle) {
    return angle * Math.PI / 180;
}

// Model Constructor function
function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.iTexCoordsBuffer = gl.createBuffer();
    this.iIndexBuffer = gl.createBuffer();
    this.count = 0;

    // Identifier of a diffuse texture
    this.idTextureDiffuse  = -1;

    this.BufferData = function(vertices, indices, texCoords) {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        this.count = indices.length;
    }

    this.Draw = function() {
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.idTextureDiffuse);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordsBuffer);
        gl.vertexAttribPointer(shProgram.iAttribTexCoords, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribTexCoords);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);

        gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    }

    this.DrawWireframe = function() {

        for (let p=0; p<this.count; p+=3)
            gl.drawElements(gl.LINE_LOOP, 3, gl.UNSIGNED_SHORT, p*2);
    }
}

/**
 * Поверхня кон’югації коаксіального циліндра й конуса (за методикою з VGGI/model.js).
 * Заповнює data.verticesF32, data.texcoordsF32, data.indicesU16.
 */
function CreateSurfaceData(data, params) {
    params = params || {};

    const R1 = params.R1 !== undefined ? params.R1 : 0.5;
    const R2 = params.R2 !== undefined ? params.R2 : 1.5;
    const c = params.c !== undefined ? params.c : 6.0;
    const phiDeg = params.phiDeg !== undefined ? params.phiDeg : 30;
    const numU = Math.max(2, Math.floor(params.numU !== undefined ? params.numU : 24));
    const numV = Math.max(3, Math.floor(params.numV !== undefined ? params.numV : 72));

    const phi = deg2rad(phiDeg);

    let a = R2 - R1;
    if (Math.abs(R2 - R1) < 1e-9)
        a = 1e-5;

    let b;
    if (phi < 0 && a < 0)
        b = c / 4;
    else if (phi > 0 && a > 0)
        b = c / 4;
    else if (phi < 0 && a > 0)
        b = (3 * c) / 4;
    else if (phi > 0 && a < 0)
        b = (3 * c) / 4;

    const r = function(z) {
        return a * (1 - Math.cos((2 * Math.PI * z) / c)) + R1;
    };

    const vertCount = numU * numV;
    const verticesF32 = new Float32Array(vertCount * 3);
    const texcoordsF32 = new Float32Array(vertCount * 2);

    for (let i = 0; i < numU; i++) {
        const z = (b * i) / (numU - 1);
        const radius = r(z);
        for (let j = 0; j < numV; j++) {
            const theta = (2 * Math.PI * j) / numV;
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);

            const idx = (i * numV + j) * 3;
            verticesF32[idx + 0] = radius * cosT;
            verticesF32[idx + 1] = radius * sinT;
            verticesF32[idx + 2] = z;

            const texIdx = (i * numV + j) * 2;
            texcoordsF32[texIdx + 0] = numU > 1 ? i / (numU - 1) : 0.0;
            texcoordsF32[texIdx + 1] = j / numV;
        }
    }

    const quadCount = (numU - 1) * numV;
    const indicesU16 = new Uint16Array(quadCount * 6);
    let w = 0;
    for (let i = 0; i < numU - 1; i++) {
        for (let j = 0; j < numV; j++) {
            const jn = (j + 1) % numV;
            const i0 = i * numV + j;
            const i1 = i * numV + jn;
            const i2 = (i + 1) * numV + j;
            const i3 = (i + 1) * numV + jn;

            indicesU16[w++] = i0;
            indicesU16[w++] = i2;
            indicesU16[w++] = i1;
            indicesU16[w++] = i1;
            indicesU16[w++] = i2;
            indicesU16[w++] = i3;
        }
    }

    data.verticesF32 = verticesF32;
    data.texcoordsF32 = texcoordsF32;
    data.indicesU16 = indicesU16;
}
