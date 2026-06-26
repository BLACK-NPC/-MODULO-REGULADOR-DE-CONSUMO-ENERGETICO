export const VOICE_COMMAND_GROUPS = [
  {
    label: 'Control',
    commands: [
      { cmd: 'Enciende el motor', desc: 'Activa el motor principal' },
      { cmd: 'Apaga el motor', desc: 'Detiene el motor de forma segura' },
      { cmd: 'Modo automatico', desc: 'Regulacion automatica de consumo' },
      { cmd: 'Modo manual', desc: 'Control manual del sistema' },
      { cmd: 'Pon el setpoint en 24', desc: 'Configura temperatura objetivo' },
    ],
  },
  {
    label: 'Consultas',
    commands: [
      { cmd: 'Hay alarmas', desc: 'Alertas activas del sistema' },
      { cmd: 'Estado de Firebase', desc: 'Conexion con la base de datos' },
      { cmd: 'Estado del sistema', desc: 'Resumen del regulador' },
      { cmd: 'Cual es el setpoint', desc: 'Valor de referencia activo' },
      { cmd: 'Consumo actual', desc: 'Potencia en vatios' },
      { cmd: 'Variacion de potencia hoy', desc: 'Comparacion con ayer' },
      { cmd: 'Consumo del ventilador', desc: 'Potencia del actuador' },
      { cmd: 'A que red estoy conectado', desc: 'SSID e IP del HMI' },
      { cmd: 'Que hora es', desc: 'Hora local' },
      { cmd: 'Que dia es hoy', desc: 'Fecha actual' },
      { cmd: 'En que modo esta el sistema', desc: 'Automatico o manual' },
      { cmd: 'Diagnostico del sistema', desc: 'Salud de sensores y conexion' },
      { cmd: 'Clima en Cali', desc: 'Pronostico via Open-Meteo' },
    ],
  },
  {
    label: 'Navegacion',
    commands: [
      { cmd: 'Ir a monitoreo', desc: 'Pantalla de monitoreo en tiempo real' },
      { cmd: 'Abrir alertas', desc: 'Seccion de alertas activas' },
      { cmd: 'Ir a configuraciones', desc: 'Ajustes del regulador' },
      { cmd: 'Ir a inicio', desc: 'Panel principal del sistema' },
    ],
  },
  {
    label: 'Voz',
    commands: [
      { cmd: 'Hola', desc: 'Inicia la sesion de voz' },
      { cmd: 'Ayuda', desc: 'Escucha que puedes decir' },
      { cmd: 'Mas rapido', desc: 'Aumenta velocidad de voz' },
      { cmd: 'Mas lento', desc: 'Reduce velocidad de voz' },
      { cmd: 'Para la voz', desc: 'Detiene la respuesta de voz' },
    ],
  },
  {
    label: 'Menu',
    commands: [
      { cmd: 'Mostrar que decir', desc: 'Abre este menu de comandos' },
      { cmd: 'Ocultar menu', desc: 'Cierra el menu de comandos' },
    ],
  },
]
