// src/hooks/useJarvisSocket.js
import { useState, useEffect, useRef, useCallback } from 'react';

export function useJarvisSocket() {
  const [isOnline, setIsOnline] = useState(false);
  const [jarvisStatus, setJarvisStatus] = useState('Sistemas en línea, Señor.');
  const [currentAction, setCurrentAction] = useState('NONE');
  const [socket, setSocket] = useState(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;
  const reconnectTimeoutRef = useRef(null);
  const isMounted = useRef(true);

  const connect = useCallback(() => {
    // Si ya hay una conexión abierta, no hacer nada
    if (socket?.readyState === WebSocket.OPEN) {
      console.log('🔌 WebSocket ya conectado');
      return;
    }

    // Limpiar timeout de reconexión anterior
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      // Usar la URL correcta del backend
      const wsUrl = 'ws://localhost:3001';
      console.log(`🔌 Intentando conectar a ${wsUrl}...`);
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        if (!isMounted.current) return;
        console.log('🔌 Conectado al WebSocket de JARVIS');
        setIsOnline(true);
        reconnectAttempts.current = 0;
        setJarvisStatus('Sistemas en línea, Señor.');
      };

      ws.onmessage = (event) => {
        if (!isMounted.current) return;
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Mensaje WebSocket:', data);

          // ✅ Formato de eventos que espera el backend
          if (data.event === 'system_ready') {
            setJarvisStatus(data.message || 'Sistemas en línea, Señor.');
            setIsOnline(true);
          }
          
          if (data.event === 'jarvis_action') {
            setCurrentAction(data.action || 'NONE');
            setJarvisStatus(data.text || 'Procesando...');
          }
          
          if (data.event === 'jarvis_status') {
            setJarvisStatus(data.message || 'Sistemas en línea');
          }
          
          if (data.event === 'action_result') {
            if (data.result?.message) {
              setJarvisStatus(data.result.message);
            }
            if (data.action) {
              setCurrentAction(data.action);
            }
          }
          
          if (data.event === 'pong') {
            console.log('🏓 Pong recibido');
          }
          
          if (data.event === 'error') {
            console.error('❌ Error del servidor:', data.message);
          }
        } catch (error) {
          console.error('Error parseando mensaje WebSocket:', error);
        }
      };

      ws.onclose = (event) => {
        if (!isMounted.current) return;
        console.log(`🔌 WebSocket desconectado. Código: ${event.code}`);
        setIsOnline(false);
        setJarvisStatus('Sistemas en espera...');
        
        // Intentar reconectar si no fue un cierre intencional
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(3000 * reconnectAttempts.current, 30000);
          console.log(`🔄 Reintentando conexión en ${delay}ms (intento ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted.current) {
              connect();
            }
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.log('❌ Máximo de reintentos alcanzado. WebSocket desconectado permanentemente.');
        }
      };

      ws.onerror = (error) => {
        if (!isMounted.current) return;
        console.error('❌ WebSocket error:', error);
        // No cerrar aquí, dejar que onclose maneje la reconexión
      };

      setSocket(ws);
    } catch (error) {
      console.error('❌ Error creando WebSocket:', error);
      // Intentar reconectar después de un error
      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        const delay = 3000;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted.current) {
            connect();
          }
        }, delay);
      }
    }
  }, [socket]);

  const disconnect = useCallback(() => {
    isMounted.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (socket) {
      try {
        socket.close(1000, 'Desconexión intencional');
      } catch (e) {
        console.warn('Error cerrando WebSocket:', e);
      }
      setSocket(null);
      setIsOnline(false);
    }
  }, [socket]);

  const sendCommand = useCallback((command, data = {}) => {
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        // ✅ Formato que espera el backend
        socket.send(JSON.stringify({
          event: command,
          ...data,
          timestamp: Date.now()
        }));
        return true;
      } catch (error) {
        console.error('Error enviando comando:', error);
        return false;
      }
    }
    console.warn('⚠️ WebSocket no conectado, comando no enviado');
    return false;
  }, [socket]);

  const sendPing = useCallback(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        // ✅ Formato ping que espera el backend
        socket.send(JSON.stringify({ event: 'ping' }));
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  }, [socket]);

  const broadcastAction = useCallback((action, parameters = {}, text = '') => {
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({
          event: 'jarvis_action',
          action: action,
          parameters: parameters,
          text: text,
          timestamp: Date.now()
        }));
        return true;
      } catch (error) {
        console.error('Error broadcasting action:', error);
        return false;
      }
    }
    return false;
  }, [socket]);

  useEffect(() => {
    isMounted.current = true;
    connect();

    // Ping cada 30 segundos para mantener la conexión viva
    const pingInterval = setInterval(() => {
      sendPing();
    }, 30000);

    return () => {
      isMounted.current = false;
      clearInterval(pingInterval);
      disconnect();
    };
  }, [connect, disconnect, sendPing]);

  return {
    isOnline,
    jarvisStatus,
    currentAction,
    socket,
    sendCommand,
    connect,
    disconnect,
    sendPing,
    broadcastAction
  };
}