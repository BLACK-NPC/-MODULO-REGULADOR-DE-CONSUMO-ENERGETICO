export const VOICE_COMMAND_GROUPS = [
  {
    label: 'Control',
    commands: [
      { cmd: 'Enciende el motor', desc: 'Activa el motor principal' },
      { cmd: 'Apaga el motor', desc: 'Detiene el motor de forma segura' },
      { cmd: 'Modo automatico', desc: 'Regulacion automatica de consumo' },
      { cmd: 'Modo manual', desc: 'Control manual del sistema' },
    ],
  },
  {
    label: 'Consultas',
    commands: [
      { cmd: 'Estado del sistema', desc: 'Estado actual del regulador' },
      { cmd: 'Cual es el setpoint', desc: 'Valor de referencia activo' },
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
    label: 'Asistente',
    commands: [
      { cmd: 'Hola', desc: 'Saluda al asistente' },
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
