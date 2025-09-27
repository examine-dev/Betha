// ------- Configurações (ajuste para seu template) ----------
  const CONFIG = {
    choicesPerQuestion: 5,      // ex.: A-E
    questions: 10,              // total de questões por folha (ajuste)
    bubbleMinArea: 300,        // thresholds para filtrar contornos de bolhas
    bubbleMaxArea: 5000,
    bubbleAspectMin: 0.7,
    bubbleAspectMax: 1.4,
    rowTolerance: 20,          // tolerância (px) para agrupar por linha
    fillThresholdFraction: 0.5 // proporção de pixels escuros dentro da bolha pra considerar marcada
  };

  // ------- Elementos HTML -------
  const video = document.getElementById('video');
  const snapBtn = document.getElementById('snapBtn');
  const processBtn = document.getElementById('processBtn');
  const debugCanvas = document.getElementById('debugCanvas');
  const debugCtx = debugCanvas.getContext('2d');
  const photoCanvas = document.getElementById('photoCanvas');
  const photoCtx = photoCanvas.getContext('2d');
  const logEl = document.getElementById('log');
  let lastResultJSON = null;

  // ------- Inicializa câmera -------
  async function startCamera(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
    } catch(e){
      log("Erro ao acessar câmera: " + e.message);
    }
  }

  // ------- Tirar foto -------
  snapBtn.onclick = () => {
    // desenha frame do video no canvas em resolução maior para melhorar DPI
    const w = photoCanvas.width;
    const h = photoCanvas.height;
    photoCtx.drawImage(video, 0, 0, w, h);
    debugCtx.clearRect(0,0,debugCanvas.width, debugCanvas.height);
    debugCtx.drawImage(photoCanvas, 0, 0, debugCanvas.width, debugCanvas.height);
    log("Foto capturada.");
  };

  // ------- Processar imagem com OpenCV.js -------
  async function processImage(){
    if(!cv || !cv.imread){
      log("OpenCV não carregado ainda.");
      return;
    }

    // le a imagem do canvas
    let src = cv.imread(photoCanvas);
    let orig = src.clone();

    try {
      // 1) Detectar contorno maior quadrilátero (documento) e aplicar warpPerspective
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);

      let edged = new cv.Mat();
      cv.Canny(gray, edged, 75, 200);

      // encontrar contornos
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      // achar maior contorno com 4 vertices
      let docCnt = null;
      let maxArea = 0;
      for(let i=0;i<contours.size();i++){
        let c = contours.get(i);
        let area = cv.contourArea(c);
        if(area < 1000) { c.delete(); continue; }
        let peri = cv.arcLength(c, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.02 * peri, true);
        if(approx.rows === 4 && area > maxArea){
          maxArea = area;
          docCnt = approx.clone();
        }
        approx.delete();
        c.delete();
      }
      edged.delete(); contours.delete(); hierarchy.delete();

      let warped = null;
      if(docCnt !== null){
        // ordenar pontos e fazer warp
        let pts = [];
        for(let i=0;i<4;i++){
          pts.push({x: docCnt.intPtr(i,0)[0], y: docCnt.intPtr(i,0)[1]});
        }
        docCnt.delete();
        // ordenar manualmente TL,TR,BR,BL
        pts.sort((a,b)=>a.x+a.y - (b.x+b.y));
        // simplificação: usar bounding rectangle externo (fallback simples)
        let rect = cv.boundingRect(cv.matFromArray(4,1,cv.CV_32SC2, [pts[0].x,pts[0].y, pts[1].x,pts[1].y, pts[2].x,pts[2].y, pts[3].x,pts[3].y]));
        // usar ROI como simplificação para evitar transformações complexas
        let x=rect.x, y=rect.y, w=rect.width, h=rect.height;
        warped = orig.roi(rect);
      } else {
        log("Documento não detectado — usando imagem inteira.");
        warped = orig;
      }

      // 2) Converter para grayscale e aplicar threshold adaptativo
      let wGray = new cv.Mat();
      cv.cvtColor(warped, wGray, cv.COLOR_RGBA2GRAY);
      // equalizar contraste opcional
      // cv.equalizeHist(wGray, wGray);

      let thresh = new cv.Mat();
      // usar threshold adaptativo + binary inverse para bolhas preenchidas serem brancas
      cv.adaptiveThreshold(wGray, thresh, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 25, 10);

      // 3) Limpeza morfológica
      let kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3,3));
      cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel);

      // 4) Encontrar contornos de bolhas
      let cnts = new cv.MatVector();
      let hier = new cv.Mat();
      cv.findContours(thresh, cnts, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const bubbles = [];
      for(let i=0;i<cnts.size();i++){
        let c = cnts.get(i);
        let rect = cv.boundingRect(c);
        let area = cv.contourArea(c);
        let aspect = rect.width / rect.height;
        if(area >= CONFIG.bubbleMinArea && area <= CONFIG.bubbleMaxArea &&
           aspect >= CONFIG.bubbleAspectMin && aspect <= CONFIG.bubbleAspectMax){
          bubbles.push({x: rect.x, y: rect.y, w: rect.width, h: rect.height, area});
        }
        c.delete();
      }
      cnts.delete(); hier.delete();

      if(bubbles.length === 0){
        log("Nenhuma bolha detectada. Ajuste CONFIG e verifique qualidade da foto.");
      } else {
        log(`Contornos 'bolha' detectados: ${bubbles.length}`);
      }

      // 5) Agrupar bolhas por linhas (por coordenada y)
      bubbles.sort((a,b)=>a.y - b.y);
      const rows = [];
      for(let b of bubbles){
        let found = false;
        for(let r of rows){
          // se y próximo, pertence à mesma linha
          if(Math.abs(b.y - r.meanY) <= CONFIG.rowTolerance){
            r.items.push(b);
            r.meanY = (r.meanY * (r.count) + b.y) / (r.count + 1);
            r.count += 1;
            found = true; break;
          }
        }
        if(!found){
          rows.push({items: [b], meanY: b.y, count: 1});
        }
      }

      // ordenar linhas por y e ordenar itens dentro da linha por x
      rows.sort((a,b)=>a.meanY - b.meanY);
      for(let r of rows) r.items.sort((a,b)=>a.x - b.x);

      // 6) Selecionar por questão: assumindo que cada linha representa questionsPerRow bolhas
      // strategy simples: flatten rows and group N por questão
      let flat = [];
      rows.forEach(r=> r.items.forEach(it=> flat.push(it)));
      // Se o número detectado não for igual a questions*choices, tentamos heurística alternativa.
      const expectedTotal = CONFIG.questions * CONFIG.choicesPerQuestion;
      if(flat.length < expectedTotal){
        log("Quantidade de bolhas detectadas menor que o esperado. Pode ser necessário ajustar thresholds ou recortar melhor a área do gabarito.");
      }

      // 7) Calcular preenchimento de cada bolha: contar pixels brancos em thresh
      const results = [];
      for(let i=0;i<flat.length;i++){
        const it = flat[i];
        // extrair ROI do thresh
        let roi = thresh.roi(new cv.Rect(it.x, it.y, it.w, it.h));
        // contar pixels brancos (255) -> área preenchida
        let nonZero = cv.countNonZero(roi);
        roi.delete();
        it.filledFraction = nonZero / (it.w * it.h);
      }

      // 8) Agrupar por questão: cada grupo tem CONFIG.choicesPerQuestion bolhas (simples)
      const answers = [];
      for(let q=0; q<CONFIG.questions; q++){
        const base = q * CONFIG.choicesPerQuestion;
        const group = flat.slice(base, base + CONFIG.choicesPerQuestion);
        if(group.length === 0) {
          answers.push({q: q+1, selected: null, reason: "no_bubbles"});
          continue;
        }
        // encontra a bolha com maior filledFraction acima do threshold
        let best = group.reduce((a,b)=> (a.filledFraction > b.filledFraction ? a : b));
        if(best.filledFraction >= CONFIG.fillThresholdFraction){
          // mapa índice para letra
          const idx = group.indexOf(best);
          const letter = String.fromCharCode(65 + idx); // 0->A,1->B...
          answers.push({q: q+1, selected: letter, confidence: best.filledFraction});
        } else {
          // nenhuma forte o suficiente
          // se houver múltiplas fracionadas, podemos marcar ambíguo
          const candidates = group.filter(g=> g.filledFraction >= 0.2).map(g => ({x:g.x, frac:g.filledFraction}));
          answers.push({q: q+1, selected: null, confidence: best.filledFraction, candidates});
        }
      }

      // 9) Monta JSON de saída
      const output = {
        template_id: "template_demo", // preencher conforme seu fluxo (pode vir do QR)
        timestamp: new Date().toISOString(),
        questions: CONFIG.questions,
        choicesPerQuestion: CONFIG.choicesPerQuestion,
        answers: answers
      };

      lastResultJSON = output;
      document.getElementById('downloadJson').disabled = false;

      // 10) Debug visual: desenhar retangulos detectados e resultados no debugCanvas
      // desenhar o warped em debugCanvas
      cv.imshow(debugCanvas, warped);
      // overlay retângulos e letras
      debugCtx.strokeStyle = 'lime';
      debugCtx.lineWidth = 2;
      debugCtx.font = '18px Arial';
      for(let i=0;i<flat.length;i++){
        const it = flat[i];
        // escala entre warped e debugCanvas (já desenhado por cv.imshow)
        const sx = debugCanvas.width / warped.cols;
        const sy = debugCanvas.height / warped.rows;
        debugCtx.strokeRect(it.x * sx, it.y * sy, it.w * sx, it.h * sy);
        debugCtx.fillStyle = 'red';
        debugCtx.fillText((i+1) + ' f=' + it.filledFraction.toFixed(2), it.x * sx, (it.y-4) * sy);
      }

      log("Processamento concluído. JSON pronto.");
      log(JSON.stringify(output, null, 2));

      // limpar mats
      gray.delete(); wGray.delete(); thresh.delete(); kernel.delete();
      if(warped !== orig) warped.delete();
      src.delete(); orig.delete();

    } catch(err){
      log("Erro no processamento: " + err);
      try{ src.delete(); }catch(e){}
    }
  }

  // botão Processar
  processBtn.onclick = processImage;

  // botão baixar JSON
  document.getElementById('downloadJson').onclick = () => {
    if(!lastResultJSON) return alert("Sem resultado para baixar.");
    const blob = new Blob([JSON.stringify(lastResultJSON, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'resultado_gabarito.json'; a.click();
    URL.revokeObjectURL(url);
  };

  // util
  function log(txt){ logEl.textContent = txt + "\n\n" + logEl.textContent; }

  // OpenCV ready
  function onOpenCvReady(){
    log("OpenCV carregado.");
    startCamera();
  }

  // inicia imediatamente se já carregou
  if(typeof cv !== 'undefined' && cv && cv.imread){
    onOpenCvReady();
  }