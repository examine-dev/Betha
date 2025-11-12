// O objeto 'cv' (OpenCV) e a função 'jsQR' devem estar disponíveis globalmente.

// ------- Elementos HTML e Configurações Globais (Mantenho como você forneceu) -------
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

const GABARITO_CORRETO = {
    1: 'A', 2: 'B', 3: 'E', 4: 'C', 5: 'D', 6: 'A', 7: 'C', 8: 'B', 9: 'E', 10: 'D',
    11: 'B', 12: 'A', 13: 'C', 14: 'D', 15: 'E', 16: 'B', 17: 'A', 18: 'D', 19: 'C', 20: 'E',
    21: 'A', 22: 'D', 23: 'B', 24: 'C', 25: 'E', 26: 'A', 27: 'B', 28: 'D', 29: 'C', 30: 'E',
    31: 'B', 32: 'A', 33: 'E', 34: 'C', 35: 'D', 36: 'A', 37: 'B', 38: 'C', 39: 'E', 40: 'D',
    41: 'C', 42: 'A', 43: 'B', 44: 'D', 45: 'E', 46: 'A', 47: 'C', 48: 'B', 49: 'E', 50: 'D', 
    51: 'B', 52: 'A', 53: 'C', 54: 'E', 55: 'D', 56: 'B', 57: 'C', 58: 'A', 59: 'D', 60: 'E',
    61: 'A', 62: 'B', 63: 'D', 64: 'C', 65: 'E', 66: 'B', 67: 'A', 68: 'D', 69: 'C', 70: 'E',
    71: 'D', 72: 'B', 73: 'A', 74: 'C', 75: 'E', 76: 'A', 77: 'B', 78: 'C', 79: 'D', 80: 'E',    
    81: 'B', 82: 'D', 83: 'A', 84: 'C', 85: 'E', 86: 'D', 87: 'B', 88: 'A', 89: 'C', 90: 'E',
    91: 'B', 92: 'D', 93: 'A', 94: 'E', 95: 'C', 96: 'D', 97: 'A', 98: 'B', 99: 'E', 100: 'C' 
};

// 1. inicia o OpenCv
function onOpenCvReady() {
    cv['onRuntimeInitialized'] = () => {
        document.getElementById('log').innerText = 'OpenCV carregado com sucesso!';
        startCam();

    };
}

// 2. Inicia a câmera do dispositivo
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
            video.addEventListener('loadeddata', startProcessing); // Chamada ao processamento do vídeo
        })
        .catch(err => {
            console.error('Erro ao acessar a câmera:', err);
            document.getElementById('log').innerText = 'Erro ao acessar a câmera';
        });
};

// Configuração da câmera
navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
  .then(stream => { video.srcObject = stream; })
  .catch(err => console.error("Erro ao acessar câmera:", err));

video.addEventListener("loadeddata", () => {
  processarFrame();
});

// === Função principal de processamento ===
function processarFrame() {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  let src = cv.imread(canvas);

  try {
    let retangulos = detectarContornos(src);
    let folhaRect = detectaRetanguloMacro(src, retangulos);

    if (folhaRect) {
      // 🔹 Obtem o retângulo principal (ROI)
      let folhaCorrigida = corrigirPerspectiva(src, folhaRect);

      // Aqui você pode continuar com o pipeline de leitura:
      // detectar bolhas, gabarito, etc.
      cv.imshow("canvas", folhaCorrigida);

      folhaCorrigida.delete();
    }

    src.delete();
  } catch (e) {
    console.error("Erro no processamento:", e);
    src.delete();
  }

  requestAnimationFrame(processarFrame);
}


// === Detecta os contornos e retorna os candidatos a retângulos ===
function detectarContornos(src) {
  let gray = new cv.Mat();
  let thresh = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
  cv.Canny(gray, thresh, 75, 200);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let rects = [];
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let peri = cv.arcLength(cnt, true);
    let approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

    // 🔹 Se for um quadrilátero grande, considera como candidato
    if (approx.rows === 4 && cv.contourArea(approx) > 20000) {
      rects.push(approx);
    }
  }

  gray.delete(); thresh.delete(); hierarchy.delete();
  return rects;
}


// === Localiza o retângulo principal (macro) ===
function detectaRetanguloMacro(src, rects) {
  if (!rects || rects.length === 0) return null;

  // Ordena por área e pega o maior
  rects.sort((a, b) => cv.contourArea(b) - cv.contourArea(a));
  const maior = rects[0];

  // Extrai os quatro pontos do contorno
  let pts = [];
  for (let i = 0; i < 4; i++) {
    pts.push({
      x: maior.intPtr(i, 0)[0],
      y: maior.intPtr(i, 0)[1]
    });
  }

  return pts;
}


// === 🧠 Correção de perspectiva ===
function corrigirPerspectiva(src, pontos) {
  // 🔹 Ordena os pontos: topo-esq, topo-dir, baixo-esq, baixo-dir
  pontos.sort((a, b) => a.y - b.y);
  let top = pontos.slice(0, 2).sort((a, b) => a.x - b.x);
  let bottom = pontos.slice(2, 4).sort((a, b) => a.x - b.x);

  let tl = top[0];
  let tr = top[1];
  let bl = bottom[0];
  let br = bottom[1];

  // 🔹 Calcula largura e altura do novo retângulo
  let largura = Math.max(
    Math.hypot(br.x - bl.x, br.y - bl.y),
    Math.hypot(tr.x - tl.x, tr.y - tl.y)
  );
  let altura = Math.max(
    Math.hypot(tr.x - br.x, tr.y - br.y),
    Math.hypot(tl.x - bl.x, tl.y - bl.y)
  );

  // 🔹 Define os pontos destino (retângulo “achatado”)
  let srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y,
    tr.x, tr.y,
    bl.x, bl.y,
    br.x, br.y
  ]);

  let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    largura - 1, 0,
    0, altura - 1,
    largura - 1, altura - 1
  ]);

  // 🔹 Aplica a transformação
  let M = cv.getPerspectiveTransform(srcPts, dstPts);
  let corrigida = new cv.Mat();
  cv.warpPerspective(src, corrigida, M, new cv.Size(largura, altura));

  srcPts.delete();
  dstPts.delete();
  M.delete();

  return corrigida;
}

