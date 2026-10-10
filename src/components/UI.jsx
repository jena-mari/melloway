import {ArrowRight} from 'lucide-react';
export function Button({children,className='',...props}){return <button className={`button ${className}`} {...props}>{children}</button>}
export function Next({children='keep going',...props}){return <Button className="pink" {...props}>{children}<ArrowRight size={19}/></Button>}
export function Chips({options,value,onChange,multiple=false}){return <div className="chips">{options.map(option=>{const selected=multiple?value.includes(option):value===option;return <button key={option} type="button" className={`chip ${selected?'selected':''}`} aria-pressed={selected} onClick={()=>onChange(multiple?(selected?value.filter(v=>v!==option):[...value,option]):selected?'':option)}>{option}{selected&&<span aria-hidden="true"> ✓</span>}</button>})}</div>}
export function Field({label,id,...props}){return <label className="field" htmlFor={id}><span>{label}</span><input id={id} {...props}/></label>}
export function MoodImage({src,alt='',className=''}){return <img src={src} alt={alt} className={className} loading="lazy" onError={e=>{e.currentTarget.style.display='none';e.currentTarget.parentElement.classList.add('image-fallback');}}/>}
