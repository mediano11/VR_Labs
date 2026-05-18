'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let surfaceWebCam;              // A substrate for webcam image
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.
let stereoCam;                  // Object holding stereo camera and its parameters

let iTextureWebCam = null;

let video;


// Constructor
function ShaderProgram(name, program) {

    this.name = name;
    this.prog = program;

    this.iAttribVertex   = -1;
    this.iAttribTexCoords = -1;
    this.iColor          = -1;
    this.iModelViewMatrix = -1;
    this.iProjectionMatrix = -1;
    this.iTMU0           = -1;
    this.bUseTexture     = -1;

    this.Use = function() {
        gl.useProgram(this.prog);
    }
}


// Read slider values and update stereoCam
function readControls() {
    stereoCam.eyeSeparation         = parseFloat(document.getElementById('eyeSep').value);
    stereoCam.convergence           = parseFloat(document.getElementById('convergence').value);
    stereoCam.FOV                   = parseFloat(document.getElementById('fov').value);
    stereoCam.nearClippingDistance  = parseFloat(document.getElementById('nearClip').value);
}


function draw() {
    readControls();

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.uniform1i(shProgram.iTMU0, 0);

    // ── PATH ZERO: DRAW WEB-CAMERA IN ZERO PARALLAX PLANE ──────────────────

    if (iTextureWebCam) {
        // Upload current video frame into the GPU texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, iTextureWebCam);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);

        // Orthographic projection covers the quad [0,1]×[0,1] at z = -9
        let matrOrth = m4.orthographic(0, 1, 0, 1, 8, 20);
        gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrOrth);
        gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, m4.identity());

        gl.uniform1i(shProgram.bUseTexture, 1);

        gl.depthMask(false);
        surfaceWebCam.idTextureDiffuse = iTextureWebCam;
        surfaceWebCam.Draw();
        gl.depthMask(true);
    }

    // ── STEREO ANAGLYPH PASSES ──────────────────────────────────────────────

    let modelView          = spaceball.getViewMatrix();
    let rotateToPointZero  = m4.axisRotation([0.707, 0.707, 0], 0.7);
    let translateToPointZero = m4.translation(0, 0, -10);

    const colorPolygon = new Float32Array([0.5, 0.5, 0.5, 1]);
    const colorEdge    = new Float32Array([1, 1, 1, 1]);

    gl.uniform1i(shProgram.bUseTexture, 0);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 0);

    // LEFT EYE – red channel
    let matrLeftFrustum = stereoCam.calcLeftFrustum();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrLeftFrustum);

    let matAccum0 = m4.multiply(rotateToPointZero, modelView);
    let matAccum1 = m4.multiply(m4.translation(stereoCam.eyeSeparation / 2, 0, 0), matAccum0);
    let matAccum2 = m4.multiply(translateToPointZero, matAccum1);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum2);

    gl.colorMask(true, false, false, true);
    gl.uniform4fv(shProgram.iColor, colorPolygon);
    surface.Draw();
    gl.uniform4fv(shProgram.iColor, colorEdge);
    surface.DrawWireframe();

    // RIGHT EYE – cyan channel
    gl.clear(gl.DEPTH_BUFFER_BIT);

    let matrRightFrustum = stereoCam.calcRightFrustum();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, matrRightFrustum);

    matAccum0 = m4.multiply(rotateToPointZero, modelView);
    matAccum1 = m4.multiply(m4.translation(-stereoCam.eyeSeparation / 2, 0, 0), matAccum0);
    matAccum2 = m4.multiply(translateToPointZero, matAccum1);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum2);

    gl.colorMask(false, true, true, true);
    gl.uniform4fv(shProgram.iColor, colorPolygon);
    surface.Draw();
    gl.uniform4fv(shProgram.iColor, colorEdge);
    surface.DrawWireframe();

    // Restore defaults
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);
}


/* Initialize the WebGL context. Called from init() */
function initGL() {
    let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

    shProgram = new ShaderProgram('Basic', prog);
    shProgram.Use();

    shProgram.iAttribVertex    = gl.getAttribLocation(prog,  'vertex');
    shProgram.iAttribTexCoords = gl.getAttribLocation(prog,  'tex');
    shProgram.iModelViewMatrix = gl.getUniformLocation(prog, 'ModelViewMatrix');
    shProgram.iProjectionMatrix= gl.getUniformLocation(prog, 'ProjectionMatrix');
    shProgram.iColor           = gl.getUniformLocation(prog, 'color');
    shProgram.bUseTexture      = gl.getUniformLocation(prog, 'bUseTexture');
    shProgram.iTMU0            = gl.getUniformLocation(prog, 'iTMU0');

    // ── Surface model ───────────────────────────────────────────────────────
    let data = {};
    CreateSurfaceData(data);

    surface = new Model('Surface');
    surface.BufferData(data.verticesF32, data.indicesU16, data.texcoordsF32);
    surface.idTextureDiffuse = LoadTexture();

    // ── Webcam quad (full-screen at z = -9 in orthographic [0,1]×[0,1]) ────
    //
    //  (0,1)──(1,1)
    //    |  \  |
    //  (0,0)──(1,0)
    //
    let camVerts = new Float32Array([
        0, 0, -9,
        1, 0, -9,
        0, 1, -9,
        1, 1, -9
    ]);
    // Flip V so the camera image is not upside down
    let camTex = new Float32Array([
        0, 1,
        1, 1,
        0, 0,
        1, 0
    ]);
    let camIdx = new Uint16Array([0, 1, 2,  1, 3, 2]);

    surfaceWebCam = new Model('SurfaceWebCam');
    surfaceWebCam.BufferData(camVerts, camIdx, camTex);

    // ── Stereo camera ───────────────────────────────────────────────────────
    stereoCam = new StereoCamera(
        0.7,    // eyeSeparation  (dm)
        14.0,   // convergence    (dm)
        1.0,    // aspectRatio    (canvas is square 600×600)
        0.4,    // FOV            (radians)
        8.0,    // nearClip       (dm)
        20.0    // farClip        (dm)
    );

    gl.enable(gl.DEPTH_TEST);
}


/* Creates and links a GLSL program from vertex and fragment shader source. */
function createProgram(gl, vShader, fShader) {
    let vsh = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsh, vShader);
    gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS))
        throw new Error('Error in vertex shader:  ' + gl.getShaderInfoLog(vsh));

    let fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsh, fShader);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS))
        throw new Error('Error in fragment shader:  ' + gl.getShaderInfoLog(fsh));

    let prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error('Link error in program:  ' + gl.getProgramInfoLog(prog));

    return prog;
}


/* Initialisation – called on page load */
function init() {
    let canvas;
    try {
        canvas = document.getElementById('webglcanvas');
        gl = canvas.getContext('webgl');
        if (!gl) throw 'Browser does not support WebGL';
    } catch (e) {
        document.getElementById('canvas-holder').innerHTML =
            '<p>Sorry, could not get a WebGL graphics context.</p>';
        return;
    }

    try {
        initGL();
    } catch (e) {
        document.getElementById('canvas-holder').innerHTML =
            '<p>Sorry, could not initialize the WebGL graphics context: ' + e + '</p>';
        return;
    }

    // ── Web camera ──────────────────────────────────────────────────────────
    video = document.createElement('video');
    video.autoplay = true;

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(function (stream) {
            video.srcObject = stream;

            let track    = stream.getVideoTracks()[0];
            let settings = track.getSettings();

            video.onloadedmetadata = function () {
                video.play();
            };

            video.oncanplay = function () {
                iTextureWebCam = CreateWebCamTexture(settings.width, settings.height);
            };
        })
        .catch(function (err) {
            console.warn('Webcam not available: ' + err.name + ': ' + err.message);
        });

    // Redraw at ~20 fps to update the webcam texture continuously
    setInterval(draw, 1000 / 20);

    spaceball = new TrackballRotator(canvas, draw, 0);

    draw();
}


// let socket = new WebSocket("ws://192.168.0.102:8080/sensor/connect&type=android.sensor.magnetic_field");

// socket.onopen  =function() {
//     console.log("Connected");
//     socket.send("Hello, server!");
// }

// socket.onmessage = function(event) 
// {
//     console.log("Received:", event.data);

// }

// function quatMultiply(q1, q2) {
//     const [w1,x1,y1,z1] = q1;
//     const [w2,x2,y2,z2] = q2;
//     return [
//       w1*w2 - x1*x2 - y1*y2 - z1*z2,
//       w1*x2 + x1*w2 + y1*z2 - z1*y2,
//       w1*y2 - x1*z2 + y1*w2 + z1*x2,
//       w1*z2 + x1*y2 - y1*x2 + z1*w2
//     ];
//   }

//   // angles3d- array of angles
//   // magnRad- magnitude
//   function quatFromEulerAngles(angles3d, magnRad) {
//     const half = magnRad / 2;
//     const sin = Math.sin(half);
//     return [
//       Math.cos(half),
//       angles3d[0]*sin,
//       angles3d[1]*sin,
//       angles3d[2]*sin
//     ];
//   }

//   function quatToEulerZXY(q) {
//     const [w, x, y, z] = q;

//     const beta  = Math.asin(clamp(2 * (w*x + y*z), -1, 1));
//     const alpha = Math.atan2(-2 * (x*y - w*z), 1 - 2 * (x*x + z*z));
//     const gamma = Math.atan2(-2 * (x*z - w*y), 1 - 2 * (x*x + y*y));

//     return [
//       radToDeg(alpha), // Z
//       radToDeg(beta),  // X
//       radToDeg(gamma)  // Y
//     ];
//   }

//   function radToDeg(r) { return r * 180 / Math.PI; }
//   function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

//   let lastTimeStamp = null;
//   let orientationQ = [1,0,0,0];

//   .addEventListener(jsonData)
//   {
//     const t = jsonData.timeStamp;
//     const alpha = jsonData.alpha;
//     const beta  = jsonData.alpha;
//     const gamma = jsonData.alpha;


//     if (lastTimeStamp !== null) {

//         const dt = (t - lastTimeStamp) / 1000;  // ms
//         const wx = degToRad(alpha);
//         const wy = degToRad(beta);
//         const wz = degToRad(gamma);

//         const omega = [wx, wy, wz];
//         const mag = Math.hypot(..omega);

//         if (mag > 0.0001)
//         {
//             const angles3d = omega.map(v => v / mag);
//             const magnRad = mag*dt;
//             const dq = quatFromEulerAngles(angles3d, magnRad);
//             orientationQ = quatMultiply(orientationQ, dq);
//         }

//         lastTimeStamp = t;
//     }

//   }