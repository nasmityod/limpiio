'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onClose: () => void;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary específico para el ZoomLightbox cargado dinámicamente.
 * Si la carga dinámica falla, permite cerrar el lightbox sin perder
 * la capacidad de navegación.
 */
export default class DynamicZoomWrapper extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  handleClose = () => {
    this.setState({ hasError: false });
    this.props.onClose();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-white">
          <div className="text-center p-6">
            <p className="text-slate-600 mb-4">No se pudo cargar el visor de imágenes.</p>
            <button
              type="button"
              onClick={this.handleClose}
              className="min-w-[44px] min-h-[44px] px-6 rounded-xl bg-navy text-white font-medium hover:bg-navy-light transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
