import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cleanPlanTitle, MAX_PLAN_TITLE_LENGTH } from '../utils/planTitles.js';

export default function PlanNameDialog({ plan, onApply, onClose }) {
  const dialog = useRef(null);
  const input = useRef(null);
  const [name, setName] = useState(plan.title || '');
  const [error, setError] = useState('');
  const kind = plan.prefs.mode === 'date' ? 'date' : 'hangout';
  useEffect(() => {
    dialog.current.showModal();
    input.current.focus();
    input.current.select();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  function submit(event) {
    event.preventDefault();
    const title = cleanPlanTitle(name);
    if (!title) { setError('Give your day a name first.'); return; }
    if (title.length > MAX_PLAN_TITLE_LENGTH) { setError('Keep the name to 80 characters.'); return; }
    if (onApply(title, plan.id)) onClose();
    else setError('Your name wasn’t saved. Please try again.');
  }
  return <dialog ref={dialog} className="stop-picker-dialog plan-name-dialog" aria-labelledby="plan-name-title"
    onClose={onClose} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
    <form className="stop-picker-content" onSubmit={submit}>
      <header><div><p>make it yours</p><h2 id="plan-name-title">rename ur {kind}</h2></div>
        <button type="button" aria-label="close rename" onClick={() => dialog.current.close()}><X size={22} /></button></header>
      <label className="field" htmlFor="plan-name"><span>{kind} name</span>
        <input ref={input} id="plan-name" maxLength={MAX_PLAN_TITLE_LENGTH} value={name}
          placeholder="e.g. our Sydney afternoon" aria-invalid={Boolean(error)}
          aria-describedby={error ? 'plan-name-error' : undefined}
          onChange={event => { setName(event.target.value); setError(''); }} /></label>
      {error && <p id="plan-name-error" role="alert">{error}</p>}
      <div className="plan-name-actions"><button type="button" className="button" onClick={() => dialog.current.close()}>cancel</button>
        <button className="button pink">save name</button></div>
    </form>
  </dialog>;
}
