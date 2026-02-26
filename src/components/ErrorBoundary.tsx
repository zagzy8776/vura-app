// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Log to error reporting service (implement based on your needs)
    this.setState({ errorInfo });
    
    // Send error to logging service
    this.logErrorToService(error, errorInfo);
  }

  logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
    // Implement your error logging service here
    // Example: Send to Sentry, LogRocket, or custom logging service
    console.error('Logging error to service:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });
  };

  handleRefresh = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="mb-6">
              <div className="text-6xl font-bold text-destructive mb-2">500</div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h2>
              <p className="text-muted-foreground mb-6">
                We're working to fix this issue. Please try again in a few minutes.
              </p>
            </div>
            
            <div className="space-y-3">
              <Button 
                onClick={this.handleRefresh} 
                className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90"
              >
                Refresh Page
              </Button>
              <Button 
                variant="outline" 
                onClick={this.handleGoHome} 
                className="w-full h-12 rounded-xl"
              >
                Go Home
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 p-4 bg-card rounded-lg border border-border">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground mb-2">
                  Error Details (Development)
                </summary>
                <pre className="text-xs text-muted-foreground overflow-auto">
                  {this.state.error.toString()}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;