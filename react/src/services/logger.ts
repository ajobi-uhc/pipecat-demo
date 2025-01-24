class Logger {
    log(level: string, message: unknown, ...extraArgs: unknown[]) {
      const formattedMessage = this.formatMessage(message);
      switch (level) {
        case 'info':
          console.info(formattedMessage, ...extraArgs);
          break;
        case 'warn':
          console.warn(formattedMessage, ...extraArgs);
          break;
        case 'error':
          console.error(formattedMessage, ...extraArgs);
          break;
        default:
          console.log(formattedMessage, ...extraArgs);
          break;
      }
    }
  
    info(message: unknown, ...extraArgs: unknown[]) {
      this.log('info', message, ...extraArgs);
    }
  
    warn(message: unknown, ...extraArgs: unknown[]) {
      this.log('warn', message, ...extraArgs);
    }
  
    error(message: unknown, ...extraArgs: unknown[]) {
      this.log('error', message, ...extraArgs);
    }
  
    formatMessage(message: unknown) {
      return typeof message === 'string' ? message : JSON.stringify(message);
    }
  }
  
  const logger = new Logger();
  export { logger };
  
  