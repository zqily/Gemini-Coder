import React from 'react';
import { LoaderCircle, Check, X, ChevronDown, BrainCircuit } from '../../components/Icons';
import type { AdvancedCoderPhase, AdvancedCoderState, AdvancedCoderSubtask } from '../../types';

interface PhaseProps {
  phase: AdvancedCoderPhase;
}

const PhaseOutput: React.FC<{ content: string }> = ({ content }) => (
  <div className="pl-4 py-2 bg-black/20 border-t border-gray-700/50">
    <pre className="text-xs text-gray-400 whitespace-pre-wrap font-sans">{content || 'No output.'}</pre>
  </div>
);

const Subtask: React.FC<{ subtask: AdvancedCoderSubtask }> = ({ subtask }) => (
  <details className="pl-6 border-l border-dashed border-gray-700/50">
    <summary className="list-none flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-800/50 rounded-md">
      <ChevronDown size={16} className="details-arrow" />
      <span className="text-sm font-medium text-gray-300">{subtask.title}</span>
    </summary>
    <PhaseOutput content={subtask.content} />
  </details>
);

const Phase: React.FC<PhaseProps> = ({ phase }) => {
  let Icon;
  let iconColor = 'text-gray-500';

  switch (phase.status) {
    case 'running':
      Icon = LoaderCircle;
      iconColor = 'text-blue-400 animate-spin';
      break;
    case 'completed':
      Icon = Check;
      iconColor = 'text-green-400';
      break;
    case 'skipped':
    case 'error':
      Icon = X;
      iconColor = phase.status === 'error' ? 'text-red-400' : 'text-gray-500';
      break;
    default:
      Icon = BrainCircuit; // Pending
  }
  
  const hasContent = phase.output || (phase.subtasks && phase.subtasks.length > 0);
  // Automatically open if it's running or has just completed/errored.
  const shouldBeOpen = phase.status === 'running' || phase.status === 'completed' || phase.status === 'error';

  return (
    <details className="border-b border-gray-700/50 last:border-b-0" open={shouldBeOpen}>
      <summary className="list-none flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800/50 transition-colors">
        <div className="flex items-center gap-3">
          <Icon size={18} className={iconColor} />
          <span className={`font-medium ${phase.status === 'running' ? 'text-white' : 'text-gray-300'}`}>{phase.title}</span>
        </div>
        {hasContent && <ChevronDown size={20} className="details-arrow text-gray-400" />}
      </summary>
      {phase.subtasks && <div className="py-1">{phase.subtasks.map((subtask, index) => <Subtask key={index} subtask={subtask} />)}</div>}
      {phase.output && <PhaseOutput content={phase.output} />}
    </details>
  );
};


const AdvancedCoderProgress: React.FC<{ state: AdvancedCoderState }> = ({ state }) => {
  return (
    <div className="flex items-start space-x-3 mb-10 animate-fade-in-up ml-11">
      <div className="w-full bg-[#1e1f20] border border-gray-700/50 rounded-lg overflow-hidden my-4">
        {state.phases.map(phase => <Phase key={phase.id} phase={phase} />)}
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
