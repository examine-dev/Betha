// O objeto 'cv' (OpenCV) e a função 'jsQR' devem estar disponíveis globalmente.

// ------- Elementos HTML e Configurações Globais (Mantenho como você forneceu) -------
const video = document.getElementById('video');
const canvas = document.getElementById('photoCanvas');
const auxCanvas = document.getElementById('auxCanvas');
const snapBtn = document.getElementById('snapBtn');
const log = document.getElementById('log');

// Configuração do Canvas de Exibição
canvas.style.display = 'block'; 
canvas.width = 400; // Tamanho inicial (será ajustado para a câmera)
canvas.height = 400;
let ctx = canvas.getContext('2d', { willReadFrequently: true });

// Novo Canvas para o Documento Alinhado (usaremos o auxCanvas para isso)
const TARGET_WIDTH = 600; // Largura desejada para o documento corrigido
const TARGET_HEIGHT = 800; // Altura desejada para o documento corrigido

// --- Gabarito (Mantido) ---
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

// 1. inicia o OpenCv (Mantido)
function onOpenCvReady() {
    cv['onRuntimeInitialized'] = () => {
        document.getElementById('log').innerText = 'OpenCV carregado com sucesso!';
        startCam();

    };
}

// 2. Inicia a câmera do dispositivo (Mantido)
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

// 3. Processa o frame do vídeo (ATUALIZADA com correção de perspectiva)
function startProcessing() {
    // Ajusta o canvas de visualização para o tamanho do vídeo
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Configura o canvas auxiliar para o tamanho PADRONIZADO do documento
    auxCanvas.width = TARGET_WIDTH;
    auxCanvas.height = TARGET_HEIGHT;
    
    // Matrizes para o frame de entrada (src) e o frame de saída/visualização (dst)
    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4); 
    let dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4); 

    // Matriz para o resultado da correção de perspectiva
    let warpedMat = new cv.Mat(TARGET_HEIGHT, TARGET_WIDTH, cv.CV_8UC4);
    
    // Matrizes temporárias para detecção de contorno
    let gray = new cv.Mat();
    let edged = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();


    function processVideo() {
        try {
            // 1. Captura frame da câmera
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            src.data.set(imageData.data);

            // 2. Pré-processamento para detecção do contorno
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
            cv.Canny(gray, edged, 75, 200, 3, false); // Detecção de bordas

            // 3. Detecção de Contorno
            cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let pageContour = null;
            let maxArea = 0;
            
            // Encontra o maior contorno (que deve ser a folha)
            for (let i = 0; i < contours.size(); ++i) {
                let area = cv.contourArea(contours.get(i));
                if (area > maxArea) {
                    maxArea = area;
                    pageContour = contours.get(i);
                }
            }

            // 4. Aplica a Transformação de Perspectiva se um contorno for encontrado
            let isAligned = false;
            let binaryMat = null;
            
            if (pageContour && maxArea > 10000) { // Valor mínimo de área
                // Aproxima o contorno para obter 4 vértices
                let perimeter = cv.arcLength(pageContour, true);
                let approx = new cv.Mat();
                cv.approxPolyDP(pageContour, approx, 0.02 * perimeter, true);

                if (approx.rows === 4) {
                    // Os 4 pontos foram encontrados
                    document.getElementById('log').innerText = 'Folha detectada. Corrigindo perspectiva...';

                    // Desenha o contorno detectado (opcional, para feedback visual)
                    cv.drawContours(src, contours, -1, new cv.Scalar(255, 0, 0, 255), 3, cv.LINE_8, hierarchy, 100);

                    // Reordena os 4 pontos (top-left, top-right, bottom-right, bottom-left)
                    let pts = orderPoints(approx);
                    
                    // 5. Configura a matriz de transformação
                    let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                        pts[0].x, pts[0].y, 
                        pts[1].x, pts[1].y, 
                        pts[2].x, pts[2].y, 
                        pts[3].x, pts[3].y
                    ]);

                    let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                        0, 0, 
                        TARGET_WIDTH - 1, 0, 
                        TARGET_WIDTH - 1, TARGET_HEIGHT - 1, 
                        0, TARGET_HEIGHT - 1
                    ]);

                    let M = cv.getPerspectiveTransform(srcTri, dstTri);

                    // 6. Aplica a transformação de perspectiva
                    cv.warpPerspective(src, warpedMat, M, new cv.Size(TARGET_WIDTH, TARGET_HEIGHT), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

                    // --- Prepara a Matriz Binária a partir da imagem CORRIGIDA ---
                    let warpedGray = new cv.Mat();
                    cv.cvtColor(warpedMat, warpedGray, cv.COLOR_RGBA2GRAY);
                    binaryMat = new cv.Mat();
                    cv.threshold(warpedGray, binaryMat, 60, 255, cv.THRESH_BINARY_INV);
                    
                    warpedGray.delete();
                    M.delete();
                    srcTri.delete();
                    dstTri.delete();
                    
                    // A partir daqui, trabalhamos com a imagem CORRIGIDA (warpedMat e binaryMat)
                    
                    // 7. Define as 3 regiões de referência no frame CORRIGIDO
                    let rectSize = 50;
                    let rects = [
                        { x: 20, y: 20, w: rectSize, h: rectSize },
                        { x: TARGET_WIDTH - rectSize - 20, y: 20, w: rectSize, h: rectSize },
                        { x: 20, y: TARGET_HEIGHT - rectSize - 20, w: rectSize, h: rectSize }
                    ];

                    // 8. CHAMA A FUNÇÃO DE ALINHAMENTO E PROCESSAMENTO (usando a warpedMat)
                    let alignmentResult = detectaRetanguloAlinhamentoCorrigido(warpedMat, binaryMat, rects);
                    
                    // PROCESSAMENTO DE DADOS (Sub-retângulos)
                    if(alignmentResult.isAligned){
                        isAligned = true;

                        // O retângulo macro agora é todo o frame corrigido, menos margens.
                        const macroRoiRect = new cv.Rect(
                            rects[0].x, 
                            rects[0].y, 
                            rects[1].x + rects[1].w - rects[0].x, 
                            rects[2].y + rects[2].h - rects[0].y
                        );
                        
                        // Processa o grid de 100 sub-retângulos
                        const resultadosDaLeitura = processarGrid100SubRetangulos(binaryMat, macroRoiRect, warpedMat, GABARITO_CORRETO, 25);
                        
                        document.getElementById('log').innerText = `Alinhamento OK. ${resultadosDaLeitura.totalMarcacoes} marcações, ${resultadosDaLeitura.totalAcertos} acertos.`;

                    } else {
                         document.getElementById('log').innerText = 'Corrigido, mas aguardando alinhamento dos balões...';
                    }

                    // 9. Exibe o frame CORRIGIDO no auxCanvas
                    cv.imshow('photoCanvas', warpedMat); // Exibe o frame corrigido
                    
                } else {
                    document.getElementById('log').innerText = 'Ajuste a folha na câmera (4 cantos não detectados)';
                    cv.imshow('photoCanvas', src); // Se não achou 4 cantos, mostra a câmera normal
                }
                
                approx.delete();
                pageContour.delete();
                
            } else {
                // Não encontrou o contorno principal
                document.getElementById('log').innerText = 'Posicione a folha de respostas.';
                cv.imshow('photoCanvas', src); // Mostra o frame da câmera
            }
            
            // --- Limpeza de Memória ---
            if(binaryMat) binaryMat.delete(); // Deleta a matriz binária após o uso
            contours.delete();
            hierarchy.delete();
            edged.delete();
            gray.delete();

            // Chamada recursiva para o próximo frame
            requestAnimationFrame(processVideo);

        } catch (err) {
            console.error(err);
             document.getElementById('log').innerText = 'Erro de processamento: ' + err.message;
            requestAnimationFrame(processVideo);
        }
    }

    // A primeira chamada
    requestAnimationFrame(processVideo);
}


// NOVO: Função para reordenar os pontos do contorno (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
function orderPoints(approx) {
    const pts = [];
    for(let i=0; i<approx.rows; i++){
        pts.push({x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1]});
    }

    // Ordena os pontos pela soma (TL tem a menor soma)
    pts.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const [tl, temp_br] = pts.slice(0, 2);
    const [temp_tr, br] = pts.slice(2, 4);
    
    // O ponto com a menor soma (tl) e o ponto com a maior soma (br) estão corretos.
    
    // Decide entre os dois restantes (tr e bl)
    // O ponto que tem a menor diferença (x - y) é o top-right (tr)
    // O ponto que tem a maior diferença (x - y) é o bottom-left (bl)
    
    let tr, bl;
    if((temp_br.x - temp_br.y) > (temp_tr.x - temp_tr.y)){
        tr = temp_br;
        bl = temp_tr;
    } else {
        tr = temp_tr;
        bl = temp_br;
    }

    // Garante que o tr (top-right) seja o que tem maior x e menor y
    if(tr.x < bl.x && tr.y < bl.y) {
        // Posições trocadas se o x-y sort não funcionou como esperado
        [tr, bl] = [bl, tr]; 
    }
    
    return [tl, tr, br, bl];
}


// 4. Verifica se os retângulos de referências foram posicionados na região correta da folha. (ADAPTADA)
// Agora a folha JÁ ESTÁ ALINHADA.
function detectaRetanguloAlinhamentoCorrigido(dst, binaryMat, rects) {
    const rectSize = rects[0].w;
    let alignedCount = 0;

    for (let r of rects) {
        // Usa a Matriz Binária para a verificação (agora é a matriz corrigida)
        let roi = binaryMat.roi(new cv.Rect(r.x, r.y, rectSize, rectSize));
        let nonZero = cv.countNonZero(roi);
        const area = rectSize * rectSize;
        let fillRatio = nonZero / area;
        
        // Cor para o feedback no frame CORRIGIDO
        let color;
        let isFilled = fillRatio > 0.6; // Mantive 0.6 como limiar de preenchimento
        
        if (isFilled) {
            color = new cv.Scalar(0, 255, 0, 255);   // verde
            alignedCount++; 
        } else {
            color = new cv.Scalar(0, 0, 255, 255);  // azul
        }

        // Desenha o retângulo no frame CORRIGIDO (dst)
        cv.rectangle(
            dst,
            new cv.Point(r.x, r.y),
            new cv.Point(r.x + rectSize, r.y + rectSize),
            color,
            2
        );

        roi.delete();
    }
    
    // Retorna se todos os 3 balões estão preenchidos
    return { isAligned: alignedCount === rects.length };
}


// 5. Obtem o retângulo princial (OBSOLETA, a macro ROI agora é definida pelas margens do frame CORRIGIDO)
// Esta função não é mais usada, mas a deixo aqui para referência de como seria.
function detectaRetanguloMacro(src, rects) {
    // A ROI macro é definida como o espaço entre os balões de referência, no frame corrigido.
    // O frame corrigido tem o tamanho padronizado TARGET_WIDTH x TARGET_HEIGHT.
    let xMin = rects[0].x + rects[0].w; // Início após o primeiro balão
    let yMin = rects[0].y + rects[0].h; // Início após o primeiro balão
    
    let xMax = rects[1].x;              // Fim antes do segundo balão
    let yMax = rects[2].y;              // Fim antes do terceiro balão

    // No novo fluxo, a macro ROI é definida DENTRO da função startProcessing, 
    // com base nos balões de referência no frame corrigido.
    // Para simplificar, poderíamos usar:
    // xMin = rects[0].x;
    // yMin = rects[0].y;
    // width = rects[1].x + rects[1].w - rects[0].x;
    // height = rects[2].y + rects[2].h - rects[0].y;

    // Mas, como os balões são pequenos e servem para alinhamento, vamos definir a ROI de leitura
    // como a área interna que eles delimitam:
    
    let width = xMax - xMin;
    let height = yMax - yMin;

    xMin = Math.max(0, xMin);
    yMin = Math.max(0, yMin);
    width = Math.min(src.cols - xMin, width);
    height = Math.min(src.rows - yMin, height);
    
    return new cv.Rect(xMin, yMin, width, height);
}


// 6. Processa o grid, compara com o gabarito e desenha retângulos/X coloridos. (Mantida, mas operando no frame corrigido)
function processarGrid100SubRetangulos(binaryMat, macroRoiRect, dst, gabarito, numQuestoesPorColuna = 25) {
    
    // --- Configurações da Estrutura ---
    const numColunasGabarito = 4; 
    const numLinhasGabarito = numQuestoesPorColuna; 
    const numFatiasInternas = 6; 
    const options = ['A', 'B', 'C', 'D', 'E']; 
    const thresholdFill = 0.15; 

    // --- Dimensões ---
    const larguraMacro = macroRoiRect.width;
    const alturaMacro = macroRoiRect.height;
    const xOffset = macroRoiRect.x;
    const yOffset = macroRoiRect.y;

    const subLargura = Math.floor(larguraMacro / numColunasGabarito);
    const subAltura = Math.floor(alturaMacro / numLinhasGabarito);
    const fatiaLargura = Math.floor(subLargura / numFatiasInternas);

    let resultadosQuestoes = {}; 
    let marcacoesDetectadas = 0;
    let acertos = 0;
    let questaoGlobal = 0; 

    // --- Cores ---
    const COR_ACERTO = new cv.Scalar(0, 255, 0, 255);   // Verde (Marcação correta)
    const COR_ERRO = new cv.Scalar(255, 0, 0, 255);     // Vermelho (Marcação incorreta/Múltipla)
    const COR_GABARITO_NAO_MARCADO = new cv.Scalar(0, 255, 0, 255); // Verde (para o 'X' do gabarito)
    
    // Percorre os blocos de questões (Colunas)
    for (let j = 0; j < numColunasGabarito; j++) {
        // Percorre as questões dentro do bloco (Linhas)
        for (let i = 0; i < numLinhasGabarito; i++) {
            
            questaoGlobal++;
            const respostaCorreta = gabarito[questaoGlobal]; 
            
            // Verifica se a resposta correta existe no gabarito
            if (typeof respostaCorreta === 'undefined') {
                console.warn(`Aviso: Gabarito faltando para a Questão ${questaoGlobal}. Pulando correção e desenho.`);
                continue; 
            }

            resultadosQuestoes[questaoGlobal] = {
                marcadas: [],  
                status: 'EM_BRANCO' 
            };
            
            const x_celula_global = xOffset + j * subLargura;
            const y_celula_global = yOffset + i * subAltura;

            let rectOpcaoCorretaNaoMarcada = null;

            // --- Loop de Fatias de Opção (A a E) ---
            for (let k = 1; k < numFatiasInternas; k++) { 
                
                const opcao = options[k - 1]; 

                // 1. Cria o Rect da Fatia (posição do balão)
                const rectFatia = new cv.Rect(
                    x_celula_global + k * fatiaLargura, 
                    y_celula_global, 
                    fatiaLargura, 
                    subAltura
                );

                // 2. Cria a VIEW na Matriz Binária
                // IMPORTANTE: Garantir que rectFatia não exceda os limites da binaryMat
                 const clipedRect = new cv.Rect(
                    Math.max(0, rectFatia.x),
                    Math.max(0, rectFatia.y),
                    Math.min(binaryMat.cols - rectFatia.x, rectFatia.width),
                    Math.min(binaryMat.rows - rectFatia.y, rectFatia.height)
                );

                if (clipedRect.width <= 0 || clipedRect.height <= 0) continue;

                let subRoiOpcao = binaryMat.roi(clipedRect);
                
                // 3. Contagem
                const areaTotalFatia = clipedRect.width * clipedRect.height;
                const nonZero = cv.countNonZero(subRoiOpcao);
                const fillRatio = nonZero / areaTotalFatia;
                
                // --- Lógica de Marcação e Feedback ---
                if (fillRatio > thresholdFill) {
                    marcacoesDetectadas++;
                    resultadosQuestoes[questaoGlobal].marcadas.push(opcao);
                    
                    // Desenha o RETÂNGULO colorida
                    let corRetangulo = (opcao === respostaCorreta) ? COR_ACERTO : COR_ERRO;
                    cv.rectangle(dst, 
                                 new cv.Point(clipedRect.x, clipedRect.y), 
                                 new cv.Point(clipedRect.x + clipedRect.width, clipedRect.y + clipedRect.height), 
                                 corRetangulo, 2); 
                } else if (opcao === respostaCorreta) {
                    // Se esta é a opção correta E NÃO FOI MARCADA
                    rectOpcaoCorretaNaoMarcada = clipedRect; // Armazena para desenhar o 'X' depois
                }

                // 4. Liberar a memória da VIEW
                subRoiOpcao.delete(); 
            } // Fim do loop de Opções (k)
            
            // --- Pós-processamento da Questão ---
            const marcacoes = resultadosQuestoes[questaoGlobal].marcadas;

            if (marcacoes.length === 1) {
                if (marcacoes[0] === respostaCorreta) {
                    resultadosQuestoes[questaoGlobal].status = 'ACERTO';
                    acertos++;
                } else {
                    resultadosQuestoes[questaoGlobal].status = 'ERRO_RESPOSTA';
                    // Se errou a resposta, desenha um 'X' na opção correta que deveria ter sido marcada
                    if (rectOpcaoCorretaNaoMarcada) {
                        drawX(dst, rectOpcaoCorretaNaoMarcada, COR_GABARITO_NAO_MARCADO, 2);
                    }
                }
            } else if (marcacoes.length > 1) {
                resultadosQuestoes[questaoGlobal].status = 'ERRO_MULTIPLA';
            } else { // Nenhuma marcação
                resultadosQuestoes[questaoGlobal].status = 'EM_BRANCO';
                // Desenha um 'X' na opção correta quando a questão está em branco
                if (rectOpcaoCorretaNaoMarcada) {
                    drawX(dst, rectOpcaoCorretaNaoMarcada, COR_GABARITO_NAO_MARCADO, 2);
                }
            }
            
        }
    }

    return { 
        totalMarcacoes: marcacoesDetectadas,
        totalAcertos: acertos,
        respostas: resultadosQuestoes 
    };
}

// NOVA FUNÇÃO AUXILIAR para desenhar um 'X' (Mantida)
function drawX(mat, rect, color, thickness) {
    // Linha de cima para baixo (esquerda para direita)
    cv.line(mat, 
            new cv.Point(rect.x, rect.y), 
            new cv.Point(rect.x + rect.width, rect.y + rect.height), 
            color, 
            thickness);
    // Linha de cima para baixo (direita para esquerda)
    cv.line(mat, 
            new cv.Point(rect.x + rect.width, rect.y), 
            new cv.Point(rect.x, rect.y + rect.height), 
            color, 
            thickness);
}

// --- Funções Auxiliares que não são mais usadas (Removidas/Ajustadas) ---
// detectaRetanguloAlinhamento (original) foi substituída por detectaRetanguloAlinhamentoCorrigido
// detectaRetanguloMacro (original) foi substituída pela lógica de ROI na startProcessing
