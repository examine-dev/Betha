// O objeto 'cv' (OpenCV) e a função 'jsQR' devem estar disponíveis globalmente.

// ------- Elementos HTML e Configurações Globais -------
    // Seleciona o canvas
const video = document.getElementById('video');
const canvas = document.getElementById('photoCanvas');
const snapBtn = document.getElementById('snapBtn');
const log = document.getElementById('log');

canvas.style.display = 'block'; // mostra o canvas
canvas.width = 400;
canvas.height = 400;
let ctx = canvas.getContext('2d', { willReadFrequently: true });




// scan.js




function onOpenCvReady() {
    cv['onRuntimeInitialized'] = () => {
        document.getElementById('log').innerText = 'OpenCV carregado com sucesso!';
        startCam();

    };
}

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

function startProcessing() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4); // 4 canais RGBA
    let dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);

    function processVideo() {
        try {
            // Captura o frame do vídeo
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            src.data.set(imageData.data);

            // Copia o frame para dst
            src.copyTo(dst);

            // Desenha um círculo verde no centro
            let rectSize = 50; // tamanho de cada retângulo
            let canvasWidth = canvas.width;
            let canvasHeight = canvas.height;

            let rects = [
                { x: 20, y: 20, w: rectSize, h: rectSize },                          // canto superior esquerdo
                { x: canvasWidth - rectSize - 20, y: 20, w: rectSize, h: rectSize }, // canto superior direito
                { x: 20, y: canvasHeight - rectSize - 20, w: rectSize, h: rectSize } // canto inferior esquerdo
            ];
            for (let r of rects) {
                let pt1 = new cv.Point(r.x, r.y);
                let pt2 = new cv.Point(r.x + r.w, r.y + r.h);
                cv.rectangle(dst, pt1, pt2, new cv.Scalar(0, 0, 255, 255), 2); // vermelho
            };

            cv.imshow(canvas, dst);
            

            // verifica se as três marcas estão alinhadas as marcações da folha
            detectaRectange(dst, src, rects);
            // Loop contínuo
            requestAnimationFrame(processVideo);
        } catch (err) {
            console.error(err);
        }
    }

    requestAnimationFrame(processVideo);
};

function detectaRectange(dst, src, rects){
    rectSize = rects[0].w

    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Aplica threshold para destacar regiões escuras
    let binary = new cv.Mat();
    cv.threshold(gray, binary, 60, 255, cv.THRESH_BINARY_INV);

    // Flag começa como FALSE
    let aligned = false;

    // Contador de retângulos corretamente detectados
    let alignedCount = 1;

    for (let r of rects) {
        let roi = binary.roi(new cv.Rect(r.x, r.y, rectSize, rectSize));

        let nonZero = cv.countNonZero(roi);
        let area = rectSize * rectSize;
        let fillRatio = nonZero / area;

        // Limite mínimo de preenchimento (ajustável)
        if (fillRatio > 0.2) {
            alignedCount++;
            // retângulo verde → marcador detectado
            cv.rectangle(dst, new cv.Point(r.x, r.y), new cv.Point(r.x + rectSize, r.y + rectSize),
                        new cv.Scalar(0, 255, 0, 255), 2);
        } else {
            // retângulo vermelho → não detectado
            cv.rectangle(dst, new cv.Point(r.x, r.y), new cv.Point(r.x + rectSize, r.y + rectSize),
                        new cv.Scalar(0, 0, 255, 255), 2);
        }
        document.getElementById('log').innerText = alignedCount + " - " + aligned;

        roi.delete();
    }

    // Se os 3 retângulos estiverem detectados, então aligned = true
    if (alignedCount === rects.length) {
        aligned = true;
    }

    // Mostra status na tela
    //document.getElementById('log').innerText = aligned ? 'Folha alinhada ✅' : 'Desalinhada ❌';

    // Libera memória
    gray.delete();
    binary.delete();

    return aligned;
}
