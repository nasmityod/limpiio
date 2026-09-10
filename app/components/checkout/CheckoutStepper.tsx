'use client';

import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useReducedMotion, reducedTransition } from '@/lib/motion';

interface CheckoutStepperProps {
  currentStep: number;
}

const steps = [
  { id: 0, label: 'Envío',    sub: 'Dirección y método' },
  { id: 1, label: 'Pago',     sub: 'Método y datos'     },
  { id: 2, label: 'Revisión', sub: 'Confirmación final' },
];

const CheckoutStepper = ({ currentStep }: CheckoutStepperProps) => {
  const prefersReduced = useReducedMotion();
  return (
    <nav aria-label="Progreso del checkout" className="w-full">
      {/* Móvil: lista vertical */}
      <ol role="list" className="sm:hidden flex flex-col gap-0 relative">
        <div
          className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-slate-200 -z-10"
          aria-hidden
        />
        <motion.div
          className="absolute left-[19px] top-6 w-0.5 bg-navy -z-10 origin-top"
          initial={false}
          animate={{
            height:
              currentStep === 0
                ? 0
                : currentStep === 1
                  ? 'calc(50% - 12px)'
                  : 'calc(100% - 48px)',
          }}
          transition={prefersReduced ? reducedTransition : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden
        />
        {steps.map((step) => {
          const isComplete = currentStep > step.id;
          const isActive = currentStep === step.id;
          return (
            <li key={step.id} className="flex items-start gap-3 py-2">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-sm transition-all duration-300 ${
                  isComplete
                    ? 'bg-navy text-white shadow-soft'
                    : isActive
                      ? 'bg-white border-2 border-navy text-navy shadow-card ring-4 ring-navy/10'
                      : 'bg-white border-2 border-slate-200 text-slate-600'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isComplete ? <Check size={16} /> : step.id + 1}
              </div>
              <div className="min-w-0 pt-1.5">
                <p
                  className={`text-[13px] font-semibold leading-tight ${
                    isActive || isComplete ? 'text-navy' : 'text-slate-600'
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">{step.sub}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop: horizontal */}
      <ol role="list" className="hidden sm:flex items-start justify-between relative">
        <div className="absolute top-5 left-5 right-5 h-0.5 bg-slate-200 -z-10" aria-hidden />

        <motion.div
          className="absolute top-5 left-5 h-0.5 bg-navy -z-10 origin-left"
          initial={false}
          animate={{ scaleX: currentStep / (steps.length - 1) }}
          style={{ right: 20 }}
          transition={prefersReduced ? reducedTransition : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />

        {steps.map((step) => {
          const isComplete = currentStep > step.id;
          const isActive = currentStep === step.id;
          return (
            <li key={step.id} className="flex flex-col items-center text-center w-1/3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-sm transition-all duration-300 ${
                  isComplete
                    ? 'bg-navy text-white shadow-soft'
                    : isActive
                      ? 'bg-white border-2 border-navy text-navy shadow-card ring-4 ring-navy/10'
                      : 'bg-white border-2 border-slate-200 text-slate-600'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isComplete ? <Check size={16} /> : step.id + 1}
              </div>
              <p
                className={`mt-2.5 text-[13px] font-semibold transition-colors ${
                  isActive || isComplete ? 'text-navy' : 'text-slate-600'
                }`}
              >
                {step.label}
              </p>
              <p className="hidden md:block text-[11px] text-slate-600 mt-0.5">{step.sub}</p>
            </li>
          );
        })}
      </ol>

      <p className="sm:hidden mt-3 text-center text-xs text-slate-500">
        Paso {currentStep + 1} de {steps.length}
      </p>
    </nav>
  );
};

export default CheckoutStepper;
