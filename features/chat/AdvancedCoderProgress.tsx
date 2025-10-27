import React from 'react';
import { LoaderCircle, Check, X, ChevronDown, BrainCircuit, CircleDot } from '../../components/Icons';
import type { AdvancedCoderPhase, AdvancedCoderState, AdvancedCoderSubtask } from '../../types';

interface PhaseProps {
  phase: AdvancedCoderPhase;
  isLast: boolean;
}

const PhaseOutput: React.FC<{ content: string }> = ({ content }) => (
    <div className="mt-2 pl-4 py-2 bg-black/20 border-l-2 border-gray-700">
        <pre className="text-xs text-gray-400 whitespace-pre-wrap font-sans">{content || 'No output.'}</pre>
    </div>
);

const Subtask: React.FC<{ subtask: AdvancedCoderSubtask }> = ({ subtask }) => (
    <details className="mt-1">
        <summary className="list-none flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-800/50 rounded-md text-sm text-gray-300">
            <ChevronDown size={14} className="details-arrow flex-shrink-0" />
            <span className="font-medium">{subtask.title}</span>
        </summary>
        <PhaseOutput content={subtask.content} />
    </details>
);

const Phase: React.FC<PhaseProps> = ({ phase, isLast }) => {
    let Icon;
    let iconClasses = '';
    let statusText = phase.status.charAt(0).toUpperCase() + phase.status.slice(1);

    switch (phase.status) {
        case 'running':
            Icon = LoaderCircle;
            iconClasses = 'text-blue-400 animate-spin';
            break;
        case 'completed':
            Icon = Check;
            iconClasses = 'text-green-400';
            break;
        case 'skipped':
            Icon = CircleDot;
            iconClasses = 'text-gray-500';
            statusText = 'Skipped';
            break;
        case 'error':
            Icon = X;
            iconClasses = 'text-red-400';
            statusText = 'Error';
            break;
        default: // pending
            Icon = CircleDot;
            iconClasses = 'text-gray-600';
            statusText = 'Pending';
    }

    const hasContent = phase.output || (phase.subtasks && phase.subtasks.length > 0);
    const shouldBeOpen = phase.status === 'running' || phase.status === 'completed' || phase.status === 'error';

    return (
        <li className="relative flex gap-4">
            {/* Timeline graphics */}
            <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-gray-800/50 ring-4 ring-[#1e1f20] ${phase.status === 'running' ? 'animate-pulse-strong' : ''}`}>
                    <Icon size={18} className={iconClasses} />
                </div>
                {!isLast && <div className="w-px h-full bg-gray-700/70" />}
            </div>

            {/* Content */}
            <div className="flex-1 pb-8">
                <details className="group" open={shouldBeOpen}>
                    <summary className="list-none flex items-center justify-between cursor-pointer">
                        <div className="flex flex-col">
                           <h4 className={`font-semibold ${phase.status === 'running' ? 'text-white' : 'text-gray-200'}`}>{phase.title}</h4>
                           <p className="text-xs text-gray-400">{statusText}</p>
                        </div>
                        {hasContent && <ChevronDown size={20} className="details-arrow text-gray-400 mr-2 group-hover:text-white transition-transform" />}
                    </summary>

                    <div className="mt-3">
                        {phase.subtasks && <div className="space-y-1">{phase.subtasks.map((subtask, index) => <Subtask key={index} subtask={subtask} />)}</div>}
                        {phase.output && <PhaseOutput content={phase.output} />}
                    </div>
                </details>
            </div>
        </li>
    );
};

const AdvancedCoderProgress: React.FC<{ state: AdvancedCoderState }> = ({ state }) => {
    return (
        <div className="flex items-start space-x-3 mb-10 animate-fade-in-up ml-11">
            <div className="w-full bg-[#1e1f20] border border-gray-700/50 rounded-lg my-4 overflow-hidden">
                <div className="p-4 border-b border-gray-700/50">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                        <BrainCircuit size={20} className="text-purple-400" />
                        Advanced Coder
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                        The model is running a multi-step process to generate a high-quality response.
                    </p>
                </div>
                <div className="p-4">
                    <ol>
                        {state.phases.map((phase, index) => (
                            <Phase key={phase.id} phase={phase} isLast={index === state.phases.length - 1} />
                        ))}
                    </ol>
                </div>
                {state.statusMessage && (
                    <div className="p-3 text-xs text-center text-yellow-400/80 bg-black/20 border-t border-gray-700/50">
                        {state.statusMessage}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdvancedCoderProgress;
