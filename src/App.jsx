import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAwake, setIsAwake] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [conversation, setConversation] = useState([]);
  const [userName, setUserName] = useState('Usuario');
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [isJarvisSpeaking, setIsJarvisSpeaking] = useState(false);
  const [animationMode, setAnimationMode] = useState('pulso_suave');
  
    // ===== CONFIGURACIÓN DE URLs =====
  const isProduction = window.location.hostname !== 'localhost' && 
                       window.location.hostname !== '127.0.0.1';
  
  const API_KEY = isProduction ? 'jarvis_76354b2df2ecbf258b1c983c2526962b92e44c98d0be3a3ef109cc13b6ac9612_1780689759842' : '';
  const API_URL = isProduction ? 'https://jarvis-backend-psi.vercel.app' : 'http://127.0.0.1:3001';
  const WS_URL = isProduction ? null : 'ws://127.0.0.1:3001';
  
  const getHeaders = () => {
    return API_KEY ? { 'x-api-key': API_KEY } : {};
  };

  // COLA DE COMANDOS
  const commandQueue = useRef([]);
  const isBusy = useRef(false);
  const currentAudioRef = useRef(null);
  
  const recognitionRef = useRef(null);
  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const isStartingRef = useRef(false);
  const shouldRestartRef = useRef(true);
  const reconnectTimeoutRef = useRef(null);
  const isJarvisSpeakingRef = useRef(isJarvisSpeaking);
  
  const threeContainerRef = useRef(null);
  const threeInitializedRef = useRef(false);
  
  
  // ===== FUNCIONES PARA ARCHIVOS =====
  const handleListFiles = async () => {
    setIsProcessing(true);
    try {
      const res = await axios.get(`${API_URL}/api/list-files`, { headers: getHeaders() });
      if (res.data.success) {
        const filesList = res.data.files.map(f => `• ${f}`).join('\n');
        const message = `📁 **Archivos del servidor JARVIS:**\n\n${filesList}\n\n📊 Total: ${res.data.total} archivos`;
        setResponse(message);
        setConversation(prev => [...prev, { role: 'jarvis', content: message, timestamp: Date.now() }]);
        await speakText(`Tengo ${res.data.total} archivos en mi servidor.`);
      } else {
        throw new Error('No se pudo obtener la lista');
      }
    } catch (error) {
      const errorMsg = 'No pude obtener la lista de archivos.';
      setResponse(errorMsg);
      await speakText(errorMsg);
    }
    setIsProcessing(false);
  };

  const handleReadCode = async (filePath) => {
    setIsProcessing(true);
    try {
      const res = await axios.post(`${API_URL}/api/read-code`, 
        { filePath }, 
        { headers: getHeaders() }
      );
      if (res.data.success) {
        const content = res.data.content.length > 800 ? res.data.content.substring(0, 800) + '\n... (truncado)' : res.data.content;
        const message = `📄 **Código de ${filePath}**\n\n\`\`\`javascript\n${content}\n\`\`\`\n📊 Total: ${res.data.totalLines} líneas`;
        setResponse(message);
        setConversation(prev => [...prev, { role: 'jarvis', content: message, timestamp: Date.now() }]);
        await speakText(`Mostrando el código de ${filePath}. Tiene ${res.data.totalLines} líneas.`);
      } else {
        throw new Error('No se pudo leer el archivo');
      }
    } catch (error) {
      const errorMsg = `No pude leer el archivo ${filePath}. Verifica que exista.`;
      setResponse(errorMsg);
      await speakText(errorMsg);
    }
    setIsProcessing(false);
  };

  const handleCodeStats = async (filePath) => {
    setIsProcessing(true);
    try {
      const res = await axios.post(`${API_URL}/api/code-stats`, 
        { filePath }, 
        { headers: getHeaders() }
      );
      if (res.data.success) {
        const stats = res.data.stats;
        const message = `📊 **Estadísticas de ${filePath}**\n\n📝 Líneas: ${stats.totalLines}\n🔧 Funciones: ${stats.functions}\n💬 Comentarios: ${stats.comments}\n💾 Tamaño: ${stats.sizeKB} KB`;
        setResponse(message);
        setConversation(prev => [...prev, { role: 'jarvis', content: message, timestamp: Date.now() }]);
        await speakText(`El archivo ${filePath} tiene ${stats.totalLines} líneas de código.`);
      } else {
        throw new Error('No se pudieron obtener estadísticas');
      }
    } catch (error) {
      const errorMsg = `No pude obtener estadísticas de ${filePath}.`;
      setResponse(errorMsg);
      await speakText(errorMsg);
    }
    setIsProcessing(false);
  };

  // ===== DETECCIÓN DE COMANDOS LOCALES (devuelve objeto) =====
  const detectLocalCommandReturn = (text) => {
    const lowerText = text.toLowerCase();
    
    // Crear archivo
    if (lowerText.includes('crea el archivo') || lowerText.includes('crea un archivo')) {
      const match = text.match(/(?:crea el archivo|crea un archivo)\s+(\S+\.js)/i);
      if (match) {
        return { type: 'CREATE_FILE', filePath: match[1] };
      }
    }
    
    // Listar archivos
    if (lowerText.includes('lista tus archivos') || lowerText.includes('qué archivos tienes') || lowerText.includes('listar archivos')) {
      return { type: 'LIST_FILES' };
    }
    
    // Leer código
    if (lowerText.includes('lee el archivo') || lowerText.includes('muestra el código de')) {
      const match = text.match(/(?:lee el archivo|muestra el código de)\s+(\S+\.js)/i);
      if (match) {
        return { type: 'READ_CODE', filePath: match[1] };
      }
    }
    
    // Estadísticas de archivo
    if (lowerText.includes('estadísticas del archivo') || lowerText.includes('stats del archivo')) {
      const match = text.match(/(?:estadísticas del archivo|stats del archivo)\s+(\S+\.js)/i);
      if (match) {
        return { type: 'CODE_STATS', filePath: match[1] };
      }
    }
    
    return null;
  };

  // Versión que ejecuta directamente (para compatibilidad)
  const detectLocalCommand = (text) => {
    const result = detectLocalCommandReturn(text);
    if (result) {
      if (result.type === 'LIST_FILES') handleListFiles();
      else if (result.type === 'READ_CODE') handleReadCode(result.filePath);
      else if (result.type === 'CODE_STATS') handleCodeStats(result.filePath);
      return true;
    }
    return false;
  };

  useEffect(() => {
    isJarvisSpeakingRef.current = isJarvisSpeaking;
  }, [isJarvisSpeaking]);
  
  const processQueue = async () => {
    if (isBusy.current) return;
    if (commandQueue.current.length === 0) return;
    
    isBusy.current = true;
    const nextCommand = commandQueue.current.shift();
    console.log(`📦 Procesando comando encolado: "${nextCommand.text}"`);
    await sendToJarvisInternal(nextCommand.text);
    isBusy.current = false;
    processQueue();
  };
  
  const addToQueue = (text) => {
    commandQueue.current.push({ text, timestamp: Date.now() });
    console.log(`📥 Comando encolado: "${text}" (${commandQueue.current.length} pendientes)`);
    processQueue();
  };
  
  const stopSpeaking = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsJarvisSpeaking(false);
    console.log('🔇 JARVIS ha dejado de hablar');
  };
  
  // ===== INICIALIZAR VISUALIZACIÓN 3D =====
  useEffect(() => {
    if (threeInitializedRef.current || !threeContainerRef.current) return;
    
    const initThree = async () => {
      const THREE = await import('three');
      
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      scene.fog = new THREE.FogExp2(0x000000, 0.008);
      
      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 1, 12);
      camera.lookAt(0, 0, 0);
      
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      threeContainerRef.current.appendChild(renderer.domElement);
      
      const ambientLight = new THREE.AmbientLight(0x111122);
      scene.add(ambientLight);
      const pointLight = new THREE.PointLight(0x00ff88, 0.8, 20);
      pointLight.position.set(2, 3, 4);
      scene.add(pointLight);
      const backLight = new THREE.PointLight(0x00aa55, 0.4, 15);
      backLight.position.set(-2, -1, -5);
      scene.add(backLight);
      
      const geometry = new THREE.SphereGeometry(2.8, 128, 128);
      const uniforms = {
        uTime: { value: 0 },
        uAmplitude: { value: 0 },
        uColor: { value: new THREE.Color(0x00ff88) }
      };
      
      const vertexShader = `
        uniform float uTime;
        uniform float uAmplitude;
        varying vec3 vNormal;
        varying vec2 vUv;
        void main() {
          vNormal = normalize(normal);
          vUv = uv;
          float deformation = sin(position.y * 3.0 + uTime * 5.0) * uAmplitude * 0.4;
          deformation += sin(position.x * 3.0 + uTime * 4.0) * uAmplitude * 0.3;
          deformation += sin(position.z * 3.0 + uTime * 6.0) * uAmplitude * 0.3;
          vec3 newPosition = position + normal * deformation;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `;
      
      const fragmentShader = `
        uniform float uTime;
        uniform float uAmplitude;
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec2 vUv;
        void main() {
          float glow = pow(0.55 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 1.8);
          float pulse = 0.7 + uAmplitude * 1.5;
          float rings = sin(vUv.y * 20.0 - uTime * 8.0) * 0.3;
          rings += cos(vUv.x * 20.0 + uTime * 6.0) * 0.3;
          rings = max(0.0, rings * uAmplitude * 2.0);
          vec3 finalColor = uColor * (glow * pulse + rings);
          finalColor += vec3(0.2, 0.5, 0.8) * glow * 0.3 * pulse;
          gl_FragColor = vec4(finalColor, 0.9);
        }
      `;
      
      const shaderMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        side: THREE.DoubleSide
      });
      
      const sphere = new THREE.Mesh(geometry, shaderMaterial);
      scene.add(sphere);
      
      const outerGeometry = new THREE.SphereGeometry(3.0, 64, 64);
      const outerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.08, side: THREE.BackSide });
      const outerGlow = new THREE.Mesh(outerGeometry, outerMaterial);
      scene.add(outerGlow);
      
      const particleCount = 2000;
      const particlesGeometry = new THREE.BufferGeometry();
      const particlePositions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
        const radius = 3.8 + Math.random() * 1.5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        particlePositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        particlePositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        particlePositions[i * 3 + 2] = radius * Math.cos(phi);
      }
      particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
      const particleMaterial = new THREE.PointsMaterial({ color: 0x44ffaa, size: 0.045, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
      const particles = new THREE.Points(particlesGeometry, particleMaterial);
      scene.add(particles);
      
      let time = 0;
      let currentAmplitude = 0;
      
      const animate = () => {
        requestAnimationFrame(animate);
        time += 0.016;
        
        let targetAmp = 0;
        
        if (isJarvisSpeakingRef.current) {
          switch(animationMode) {
            case 'pulso_suave':
              targetAmp = 0.7 + Math.sin(time * 16) * 0.3;
              break;
            case 'pulso_fuerte':
              targetAmp = 0.8 + Math.sin(time * 30) * 0.4;
              break;
            case 'onda_lenta':
              targetAmp = 0.5 + Math.sin(time * 5) * 0.5;
              break;
            case 'aleatorio':
              targetAmp = 0.6 + Math.random() * 0.5;
              break;
            case 'multiple':
              const wave1 = Math.sin(time * 8) * 0.25;
              const wave2 = Math.sin(time * 20) * 0.15;
              const wave3 = Math.sin(time * 35) * 0.1;
              targetAmp = 0.5 + wave1 + wave2 + wave3;
              break;
            default:
              targetAmp = 0.7 + Math.sin(time * 16) * 0.3;
          }
          currentAmplitude = currentAmplitude * 0.85 + targetAmp * 0.15;
        } else if (voiceLevel > 0) {
          const targetAmpVoice = voiceLevel / 100;
          currentAmplitude = currentAmplitude * 0.85 + targetAmpVoice * 0.15;
        } else {
          currentAmplitude = currentAmplitude * 0.95;
        }
        
        uniforms.uTime.value = time;
        uniforms.uAmplitude.value = currentAmplitude;
        
        const r = 0.2 + currentAmplitude * 0.8;
        const g = 0.8 + currentAmplitude * 0.2;
        const b = 0.3 + currentAmplitude * 0.5;
        uniforms.uColor.value.setRGB(r, g, b);
        
        particles.rotation.y += 0.002;
        particleMaterial.size = 0.04 + currentAmplitude * 0.06;
        
        const glowScale = 1 + currentAmplitude * 0.08;
        outerGlow.scale.set(glowScale, glowScale, glowScale);
        outerGlow.material.opacity = 0.06 + currentAmplitude * 0.08;
        
        const camX = Math.sin(time * 0.1) * 0.1;
        const camY = Math.sin(time * 0.15) * 0.05;
        camera.position.x = camX;
        camera.position.y = 1 + camY;
        camera.lookAt(0, 0, 0);
        
        renderer.render(scene, camera);
      };
      
      animate();
      
      const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', handleResize);
      
      threeInitializedRef.current = true;
    };
    
    initThree();
  }, [voiceLevel, animationMode]);
  
  const connectWebSocket = () => {
    if (!WS_URL) {
      console.log('🔌 WebSocket deshabilitado en producción');
      return;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => console.log('🔌 Conectado a Jarvis WebSocket');
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'action_result' && data.result?.message) {
            setConversation(prev => [...prev, { role: 'jarvis', content: data.result.message, timestamp: Date.now() }]);
          }
        } catch (e) {}
      };
      ws.onclose = () => {
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      };
      wsRef.current = ws;
    } catch (error) {}
  };
  
  const initAudioAnalyzer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      await audioContext.resume();
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const average = sum / dataArray.length;
          setVoiceLevel(Math.min(100, (average / 255) * 100));
        }
        requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (error) {
      console.error('Error con micrófono:', error);
    }
  };
  
  // ===== DETECCIÓN DE COMANDOS ESPECIALES =====
  const handleSpecialCommand = (text) => {
    const lowerText = text.toLowerCase();
    
    // Comando para DETENER (silencio, espera, callate)
    if (lowerText === 'silencio' || lowerText === 'espera' || lowerText === 'callate' || 
        lowerText === 'deja de hablar' || lowerText === 'para' || lowerText === 'silencio por favor' ||
        lowerText === 'calla') {
      stopSpeaking();
      setResponse('Entendido, guardo silencio.');
      setConversation(prev => [...prev, { role: 'jarvis', content: 'Entendido, guardo silencio.', timestamp: Date.now() }]);
      return true;
    }
    
    // Comando para REANUDAR (seguí, continua, sigue hablando)
    if (lowerText === 'seguí' || lowerText === 'continúa' || lowerText === 'sigue' || 
        lowerText === 'seguí hablando' || lowerText === 'continúa por favor') {
      setResponse('Claro, ¿en qué puedo ayudarte?');
      setConversation(prev => [...prev, { role: 'jarvis', content: 'Claro, ¿en qué puedo ayudarte?', timestamp: Date.now() }]);
      speakText('Claro, ¿en qué puedo ayudarte?');
      return true;
    }
    
    // Comando para CORTAR lo que está diciendo (silenciar inmediatamente)
    if (lowerText === 'cortá' || lowerText === 'corta' || lowerText === 'callate ya' || 
        lowerText === 'suficiente' || lowerText === 'basta') {
      stopSpeaking();
      setResponse('Interrumpido. ¿En qué más puedo ayudarte?');
      setConversation(prev => [...prev, { role: 'jarvis', content: 'Interrumpido. ¿En qué más puedo ayudarte?', timestamp: Date.now() }]);
      speakText('Interrumpido. ¿En qué más puedo ayudarte?');
      return true;
    }
    
    return false;
  };
  
  // ===== ENVÍO INTERNO =====
  const sendToJarvisInternal = async (text) => {
    if (!text || text.length < 2) return;
    
    setIsProcessing(true);
    setConversation(prev => [...prev, { role: 'user', content: text, timestamp: Date.now() }]);
    
    try {
      const res = await axios.post(`${API_URL}/api/ask`, 
        { text, userName, history: conversation.slice(-5) },
        { headers: getHeaders() }
      );
      
      setResponse(res.data.text);
      setConversation(prev => [...prev, { role: 'jarvis', content: res.data.text, timestamp: Date.now() }]);
      await speakText(res.data.text);
      
      if (res.data.action && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'execute_action', action: res.data.action.type, param: res.data.action.param || '', userName }));
      }
      
    } catch (error) {
      console.error('❌ Error:', error);
      const errorMsg = 'Disculpa, tengo problemas de conexión.';
      setResponse(errorMsg);
      setConversation(prev => [...prev, { role: 'jarvis', content: errorMsg, timestamp: Date.now() }]);
      await speakText(errorMsg);
    }
    
    setIsProcessing(false);
  };
  
  // ===== ENVÍO PRINCIPAL =====
  const sendToJarvis = async (text) => {
    // Primero detectar comandos locales que requieren procesamiento especial
    const localCommand = detectLocalCommandReturn(text);
    
    if (localCommand) {
      if (localCommand.type === 'CREATE_FILE') {
        setIsProcessing(true);
        const filePath = localCommand.filePath;
        
        // Extraer el código del mensaje (lo que viene después de "con este código:")
        let code = text;
        const codeMatch = text.match(/con este código:\s*([\s\S]+)/i);
        if (codeMatch) {
          code = codeMatch[1];
        } else {
          // Si no hay código, preguntar
          const message = `¿Qué código quieres poner en ${filePath}? Escríbelo y te lo guardaré.`;
          setResponse(message);
          setConversation(prev => [...prev, { role: 'jarvis', content: message, timestamp: Date.now() }]);
          await speakText(message);
          window.pendingFilePath = filePath;
          window.waitingForCode = true;
          setIsProcessing(false);
          return;
        }
        
        try {
          const res = await axios.post(`${API_URL}/api/create-file`, 
            { filePath, content: code },
            { headers: getHeaders() }
          );
          
          if (res.data.success) {
            const message = `✅ Archivo ${filePath} creado correctamente.`;
            setResponse(message);
            setConversation(prev => [...prev, { role: 'jarvis', content: message, timestamp: Date.now() }]);
            await speakText(message);
          } else {
            throw new Error(res.data.error);
          }
        } catch (error) {
          const errorMsg = `No pude crear el archivo: ${error.response?.data?.error || error.message}`;
          setResponse(errorMsg);
          await speakText(errorMsg);
        }
        setIsProcessing(false);
        return;
      }
      
      // Procesar otros comandos locales
      if (localCommand.type === 'LIST_FILES') {
        handleListFiles();
        return;
      }
      if (localCommand.type === 'READ_CODE') {
        handleReadCode(localCommand.filePath);
        return;
      }
      if (localCommand.type === 'CODE_STATS') {
        handleCodeStats(localCommand.filePath);
        return;
      }
    }
    
    // Luego comandos especiales de voz
    if (handleSpecialCommand(text)) return;
    
    // Si JARVIS está hablando o procesando, encolar
    if (isJarvisSpeaking || isProcessing || isBusy.current) {
      console.log(`📥 Comando encolado: "${text}" (${commandQueue.current.length + 1} pendientes)`);
      addToQueue(text);
      return;
    }
    
    await sendToJarvisInternal(text);
  };
  
  // ===== TEXTO A VOZ =====
  const speakText = async (text) => {
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-MX';
    utterance.rate = 0.85;
    utterance.pitch = 0.9;
    utterance.volume = 1.0;
    
    const setBestVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferredVoices = [
        'Google UK English Male',
        'Microsoft George',
        'Microsoft David', 
        'Samantha',
        'Daniel',
        'Google UK English Female'
      ];
      
      let selectedVoice = voices.find(v => 
        (v.lang === 'en-GB' || v.lang === 'en-UK') && 
        preferredVoices.some(p => v.name.includes(p))
      );
      
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang === 'en-GB');
      }
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log('🎤 Voz JARVIS seleccionada:', selectedVoice.name);
      }
    };
    
    setBestVoice();
    
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = setBestVoice;
    }
    
    utterance.onstart = () => {
      console.log('🗣️ JARVIS comenzó a hablar');
      setIsJarvisSpeaking(true);
      isBusy.current = true;
    };
    
    utterance.onend = () => {
      console.log('✅ JARVIS terminó de hablar');
      setIsJarvisSpeaking(false);
      isBusy.current = false;
      processQueue();
    };
    
    utterance.onerror = (event) => {
      console.error('Error en voz:', event);
      setIsJarvisSpeaking(false);
      isBusy.current = false;
      processQueue();
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const usarVozPredeterminada = (text) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9;
    
    utterance.onstart = () => {
      console.log('🗣️ JARVIS comenzó a hablar (fallback)');
      setIsJarvisSpeaking(true);
      isBusy.current = true;
    };
    
    utterance.onend = () => {
      console.log('✅ JARVIS terminó de hablar');
      setIsJarvisSpeaking(false);
      isBusy.current = false;
      processQueue();
    };
    
    utterance.onerror = () => {
      setIsJarvisSpeaking(false);
      isBusy.current = false;
      processQueue();
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const reproducirVozPersonalizada = () => {
    const audio = new Audio(`${API_URL}/api/voice/jarvis.mp3`);
    currentAudioRef.current = audio;
    
    audio.onplay = () => {
      console.log('🗣️ Reproduciendo voz personalizada de JARVIS');
      setIsJarvisSpeaking(true);
      isBusy.current = true;
    };
    
    audio.onended = () => {
      console.log('✅ Voz personalizada terminada');
      setIsJarvisSpeaking(false);
      isBusy.current = false;
      currentAudioRef.current = null;
      processQueue();
    };
    
    audio.onerror = () => {
      console.error('Error con voz personalizada');
      setIsJarvisSpeaking(false);
      isBusy.current = false;
      processQueue();
    };
    
    audio.play();
  };
  
  // ===== RECONOCIMIENTO DE VOZ =====
  const initSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Usá Chrome o Edge para reconocimiento de voz');
      return null;
    }
    const SpeechRecognition = window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onstart = () => { setIsListening(true); isStartingRef.current = false; };
    recognition.onend = () => {
      setIsListening(false);
      isStartingRef.current = false;
      if (isAwake && shouldRestartRef.current && !isProcessing && !isJarvisSpeaking) {
        setTimeout(() => startListening(), 300);
      }
    };
    recognition.onerror = (event) => {
      isStartingRef.current = false;
      if (event.error === 'not-allowed') setIsAwake(false);
    };
    recognition.onresult = async (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
      }
      if (finalTranscript) {
        setTranscript(finalTranscript);
        const hasWakeWord = finalTranscript.toLowerCase().includes('jarvis');
        if ((hasWakeWord || isAwake) && !isProcessing) {
          shouldRestartRef.current = false;
          recognition.stop();
          let command = hasWakeWord ? finalTranscript.replace(/jarvis/gi, '').trim() : finalTranscript;
          if (!command) command = 'hola';
          await sendToJarvis(command);
          shouldRestartRef.current = true;
          setTimeout(() => { if (isAwake && !isProcessing && !isJarvisSpeaking) startListening(); }, 1500);
        }
      }
    };
    return recognition;
  };
  
  const startListening = () => {
    if (!isAwake || isProcessing || isStartingRef.current || isJarvisSpeaking) return;
    if (!recognitionRef.current) recognitionRef.current = initSpeechRecognition();
    if (recognitionRef.current) {
      try {
        isStartingRef.current = true;
        recognitionRef.current.start();
      } catch (e) { isStartingRef.current = false; }
    }
  };
  
  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
    setIsListening(false);
  };
  
  const toggleJarvis = () => {
    if (isAwake) {
      shouldRestartRef.current = false;
      stopListening();
      setIsAwake(false);
      setResponse('JARVIS desactivado');
      speakText('JARVIS desactivado');
    } else {
      setIsAwake(true);
      shouldRestartRef.current = true;
      setResponse('JARVIS activado');
      speakText('JARVIS activado');
      setTimeout(() => startListening(), 500);
    }
  };
  
  useEffect(() => {
    connectWebSocket();
    initAudioAnalyzer();
    setTimeout(() => startListening(), 1000);
    return () => {
      shouldRestartRef.current = false;
      stopSpeaking();
      stopListening();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);
  
  useEffect(() => {
    if (isAwake && !isProcessing && !isJarvisSpeaking && !isStartingRef.current) startListening();
  }, [isAwake, isProcessing, isJarvisSpeaking]);
  
  return (
    <div className="app">
      <div ref={threeContainerRef} className="three-container"></div>
      
      <div className="ui-overlay">
        <div className="animation-controls">
          <button className={`mode-btn ${animationMode === 'pulso_suave' ? 'active' : ''}`} onClick={() => setAnimationMode('pulso_suave')}>💓 Suave</button>
          <button className={`mode-btn ${animationMode === 'pulso_fuerte' ? 'active' : ''}`} onClick={() => setAnimationMode('pulso_fuerte')}>💪 Fuerte</button>
          <button className={`mode-btn ${animationMode === 'onda_lenta' ? 'active' : ''}`} onClick={() => setAnimationMode('onda_lenta')}>🌊 Onda</button>
          <button className={`mode-btn ${animationMode === 'aleatorio' ? 'active' : ''}`} onClick={() => setAnimationMode('aleatorio')}>🎲 Aleatorio</button>
          <button className={`mode-btn ${animationMode === 'multiple' ? 'active' : ''}`} onClick={() => setAnimationMode('multiple')}>🌀 Múltiple</button>
        </div>
        
        <div className="devices-grid">
          <div className="device-card" onClick={() => sendToJarvis('abre Spotify')}>🎵 SPOTIFY</div>
          <div className="device-card spotify-control" onClick={() => sendToJarvis('poné música')}>🎵 PLAY</div>
          <div className="device-card spotify-control" onClick={() => sendToJarvis('pausa la música')}>⏸️ PAUSE</div>
          <div className="device-card spotify-control" onClick={() => sendToJarvis('siguiente canción')}>⏭️ NEXT</div>
          <div className="device-card" onClick={() => sendToJarvis('qué puedes hacer')}>❓ AYUDA</div>
          <div className="device-card" onClick={() => sendToJarvis('dime una frase célebre')}>💬 FRASE</div>
          <div className="device-card" onClick={() => sendToJarvis('reproduce el podcast de misterio')}>🎙️ PODCAST</div>
          <div className="device-card" onClick={() => sendToJarvis('qué tenés ganas de escuchar hoy')}>🎧 RECOMENDAR</div>
        </div>
        
        <div className="conversation-panel">
          <div className="panel-header">📝 REGISTRO</div>
          <div className="conversation-list">
            {conversation.slice(-8).map((msg, idx) => (
              <div key={idx} className={`msg ${msg.role}`}>
                <span className="msg-role">{msg.role === 'user' ? '👤 TÚ' : '🤖 JARVIS'}</span>
                <span className="msg-text">{msg.content}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="control-panel-glass">
          <button className="control-btn" onClick={toggleJarvis}>
            {isAwake ? '🔴 DESACTIVAR' : '🟢 ACTIVAR'}
          </button>
          <div className="info-row">
            <span>👤 {userName}</span>
            <span>{isJarvisSpeaking ? '🗣️ Hablando...' : (isListening ? '🎤 Escuchando...' : (isAwake ? '⏳ Esperando...' : '😴 Dormido'))}</span>
          </div>
          {transcript && <div className="transcript">🎤 {transcript}</div>}
          {response && <div className="response">💬 {response}</div>}
        </div>
        
        <div className="command-input">
          <span className="command-prefix">&gt;</span>
          <input type="text" placeholder='Escribí o decí "Jarvis..."' onKeyPress={(e) => {
            if (e.key === 'Enter' && e.target.value) {
              sendToJarvis(e.target.value);
              e.target.value = '';
            }
          }} />
        </div>
      </div>
    </div>
  );
}

export default App;