// O objeto 'cv' (OpenCV) e a função 'jsQR' devem estar disponíveis globalmente.

// ------- Elementos HTML e Configurações Globais -------
    // Seleciona o canvas
const video = document.getElementById('video');
const canvas = document.getElementById('photoCanvas');
const auxCanvas = document.getElementById('auxCanvas');
const snapBtn = document.getElementById('snapBtn');
const log = document.getElementById('log');

canvas.style.display = 'block'; // mostra o canvas
canvas.width = 400;
canvas.height = 400;
let ctx = canvas.getContext('2d', { willReadFrequently: true });


// inicia o OpenCv
function onOpenCvReady() {
    cv['onRuntimeInitialized'] = () => {
        document.getElementById('log').innerText = 'OpenCV carregado com sucesso!';
        startCam();

    };
}

// Inicia a camero do dispositivo
function startCam(){
    const constraints = {        
        video: {
            facingMode: "environment"  // força a usar a câmera traseira
        },
        video: true,
        audio: false
    };
    // Pega a câmera
    navigator.mediaDevices.getUserMedia( { video: { facingMode: "environment"}, audio: false} )
        .then(stream => {
            video.srcObject = stream;
            video.play();
            video.addEventListener('loadeddata', startProcessing);
        })
        .catch(err => {
            console.error('Erro ao acessar a câmera:', err);
            document.getElementById('log').innerText = 'Erro ao acessar a câmera';
        });
};

// Processa o frame do vídeo
function startProcessing() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4); 
    let dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);

    function processVideo() {
        try {
            // Captura frame da câmera
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            src.data.set(imageData.data);

            // Copia frame para dst (onde desenharemos)
            src.copyTo(dst);

            // Define as 3 regiões de referência
            let rectSize = 50;
            let rects = [
                { x: 20, y: 20, w: rectSize, h: rectSize },
                { x: canvas.width - rectSize - 20, y: 20, w: rectSize, h: rectSize },
                { x: 20, y: canvas.height - rectSize - 20, w: rectSize, h: rectSize }
            ];

            // Detecta preenchimento e desenha retângulos
            let aligned = detectaRectange(dst, src, rects);

            // Exibe o macro apenas se estiver alinhado
            if(aligned){
                let macro = detectaRetanguloMacro(src, rects);
                auxCanvas.style.display = 'block';       // garante que o canvas está visível
                auxCanvas.width = macro.cols;
                auxCanvas.height = macro.rows;
                cv.imshow('auxCanvas', macro);           // mostra apenas no auxCanvas
                macro.delete();
            }

            // Exibe a câmera com os retângulos no photoCanvas
            cv.imshow('photoCanvas', dst);

            requestAnimationFrame(processVideo);

        } catch (err) {
            console.error(err);
        }
    }

    requestAnimationFrame(processVideo);
}

// Função de detecção
function detectaRectange(dst, src, rects) {
    const rectSize = rects[0].w;

    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    let binary = new cv.Mat();
    cv.threshold(gray, binary, 60, 255, cv.THRESH_BINARY_INV);


    let alignedCount = 0;

    for (let r of rects) {
        let roi = binary.roi(new cv.Rect(r.x, r.y, rectSize, rectSize));
        let nonZero = cv.countNonZero(roi);
        let fillRatio = nonZero / (rectSize * rectSize);

        // Verde se detectado, azul se não
        let color = fillRatio > 0.6
            ? new cv.Scalar(0, 255, 0, 255)   // verde
            : new cv.Scalar(0, 0, 255, 255);  // azul

        if (fillRatio > 0.6) alignedCount++;

        cv.rectangle(
            dst,
            new cv.Point(r.x, r.y),
            new cv.Point(r.x + rectSize, r.y + rectSize),
            color,
            2
        );
        if(alignedCount == 3){
            document.getElementById('log').innerText = alignedCount;
            let macro = detectaRetanguloMacro(src, rects);
            // Para mostrar no canvas (temporário)
            cv.imshow('photoCanvas', macro);
            // Depois de usar, lembre de liberar memória
            macro.delete();
        }

        roi.delete();
    }

    gray.delete();
    binary.delete();

    return alignedCount === rects.length;
}


function detectaRetanguloMacro(src, rects) {
    // Calcula a ROI baseada nos 3 retângulos
    let xMin = rects[0].x;
    let yMin = rects[0].y;
    let xMax = rects[1].x + rects[1].w;
    let yMax = rects[2].y + rects[2].h;

    let width = xMax - xMin;
    let height = yMax - yMin;

    xMin = Math.max(0, xMin);
    yMin = Math.max(0, yMin);
    width = Math.min(src.cols - xMin, width);
    height = Math.min(src.rows - yMin, height);

    return src.roi(new cv.Rect(xMin, yMin, width, height));
}



