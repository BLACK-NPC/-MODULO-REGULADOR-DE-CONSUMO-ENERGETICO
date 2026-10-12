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
    label: 'Consumo e historico',
    commands: [
      { cmd: 'Consumo desde las 8 hasta las 12', desc: 'Energia estimada en un rango de horas de hoy' },
      { cmd: 'Consumo de ayer', desc: 'Energia total de un dia' },
      { cmd: 'Consumo de esta semana', desc: 'Total semanal y dia de mayor gasto' },
      { cmd: 'A que hora hubo mas consumo', desc: 'Pico de potencia' },
      { cmd: 'Compara hoy con ayer', desc: 'Diferencia de consumo entre dos dias' },
      { cmd: 'Que dia se gasto mas esta semana', desc: 'Dia de mayor consumo' },
      { cmd: 'Resumen del dia', desc: 'Consumo, temperatura, humedad y fallas' },
    ],
  },
  {
    label: 'Temperatura y humedad',
    commands: [
      { cmd: 'Cual fue el pico mas alto de calor hoy', desc: 'Maxima temperatura y hora' },
      { cmd: 'Humedad maxima de ayer', desc: 'Pico de humedad y hora' },
      { cmd: 'Temperatura minima de esta semana', desc: 'Minimo registrado' },
      { cmd: 'Temperatura promedio hoy', desc: 'Promedio del dia' },
      { cmd: 'Temperatura entre las 10 y las 14', desc: 'Rango horario de hoy' },
    ],
  },
  {
    label: 'Fallas',
    commands: [
      { cmd: 'Hay alguna falla', desc: 'Fallas abiertas del diagnostico' },
      { cmd: 'Que fallas hubo hoy', desc: 'Bitacora de fallas del dia' },
      { cmd: 'Fallas de esta semana', desc: 'Resumen semanal de fallas' },
      { cmd: 'Crea una tarea para la falla', desc: 'Tarea correctiva en Servicio' },
    ],
  },
  {
    label: 'Perfiles por voz',
    commands: [
      { cmd: 'Programa un perfil', desc: 'El asistente te pregunta hora, dias y confirmacion' },
      {
        cmd: 'Perfil que encienda a las 7 de la manana y apague a las 5 de la tarde de lunes a viernes',
        desc: 'Todo en una sola frase',
      },
      { cmd: 'Que perfiles tengo', desc: 'Lista de perfiles guardados' },
      { cmd: 'Cual es el perfil activo', desc: 'Perfil en uso y su horario' },
      { cmd: 'Cuando es el proximo encendido', desc: 'Siguiente cambio del perfil activo' },
      { cmd: 'Activa el perfil Oficina', desc: 'Cambia el perfil activo' },
      { cmd: 'Borra el perfil Oficina', desc: 'Pide confirmacion antes de borrar' },
    ],
  },
  {
    label: 'Control ampliado',
    commands: [
      { cmd: 'Velocidad al 60 por ciento', desc: 'Pasa a manual y fija la velocidad' },
      { cmd: 'Sube la velocidad', desc: 'Aumenta la velocidad del ventilador' },
      { cmd: 'Apaga en 30 minutos', desc: 'Temporizador (solo con esta pagina abierta)' },
      { cmd: 'Enciende en 2 horas', desc: 'Temporizador de encendido' },
      { cmd: 'Sube el brillo', desc: 'Brillo de pantalla del HMI' },
      { cmd: 'Activa el radar de presencia', desc: 'Presencia en la automatizacion' },
      { cmd: 'Activa el registro de temperatura', desc: 'Historico de sensores' },
    ],
  },
  {
    label: 'Aire, tareas y mas',
    commands: [
      { cmd: 'Enciende el aire', desc: 'Control del aire acondicionado' },
      { cmd: 'Pon el aire en 22 grados', desc: 'Temperatura del aire' },
      { cmd: 'Que tareas tengo pendientes', desc: 'Servicio: pendientes y vencidas' },
      { cmd: 'Abre perfiles', desc: 'Abre una seccion de Configuraciones' },
      { cmd: 'Dame un consejo para ahorrar', desc: 'Recomendacion de ahorro' },
      { cmd: 'Ayuda de perfiles', desc: 'Ayuda por categoria (consumo, fallas, perfiles...)' },
    ],
  },
  {
    label: 'Navegacion',
    commands: [
      { cmd: 'Ir a monitoreo', desc: 'Pantalla de monitoreo en tiempo real' },
      { cmd: 'Abrir alertas', desc: 'Seccion de alertas activas' },
      { cmd: 'Ir a configuraciones', desc: 'Ajustes del regulador' },
      { cmd: 'Ir a inicio', desc: 'Panel principal del sistema' },
      { cmd: 'Separa la grafica de humedad', desc: 'En Monitoreo. La primera vez pregunta si la aprende' },
    ],
  },
  {
    label: 'Voz',
    commands: [
      { cmd: 'Hey Eco', desc: 'Despierta al asistente despues de tocar el microfono' },
      { cmd: 'Hola', desc: 'Saludo, una vez que ya esta escuchando' },
      { cmd: 'Ayuda', desc: 'Escucha que puedes decir' },
      { cmd: 'Mas rapido', desc: 'Aumenta velocidad de voz' },
      { cmd: 'Mas lento', desc: 'Reduce velocidad de voz' },
      { cmd: 'Para la voz', desc: 'Detiene la respuesta de voz' },
    ],
  },
  {
    label: 'Menu',
    commands: [
      { cmd: 'Mostrar que decir', desc: 'Abre el centro de voz, donde esta la lista' },
      { cmd: 'Ocultar menu', desc: 'La lista queda en el centro de voz' },
    ],
  },
]
