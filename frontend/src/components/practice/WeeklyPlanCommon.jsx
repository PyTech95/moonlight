import { Activity, Apple, CalendarCheck2, MessageCircle, Moon } from 'lucide-react';

export const CATEGORIES=[['sleep','Sleep'],['food','Food'],['activity','Activity'],['routine','Routine'],['communication','Communication']];
const ICONS={sleep:Moon,food:Apple,activity:Activity,routine:CalendarCheck2,communication:MessageCircle};
export const weekLabel=(start,end)=>{const format=value=>new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',timeZone:'Asia/Kolkata'}).format(new Date(`${value}T12:00:00+05:30`));return `${format(start)} – ${format(end)}`;};
export const CategoryBadge=({category,testId})=>{const Icon=ICONS[category]||Activity;return <span className={`plan-category ${category}`} data-testid={testId}><Icon/>{CATEGORIES.find(([value])=>value===category)?.[1]||category}</span>;};
export const PlanProgress=({done,total,testId})=>{const percent=total?Math.round(done/total*100):0;return <div className="plan-progress" data-testid={testId}><div><strong>{done} of {total} complete</strong><span>{percent}%</span></div><div className="plan-progress-track"><span style={{width:`${percent}%`}}/></div></div>;};