export interface ActualSet {exerciseId:string;ordinal:number;repetitions?:number;durationSeconds?:number;weightKg?:number;rpe?:number}
export interface ImportedPoseSummary {id:string;source:'LIVE'|'VIDEO';exerciseId:string;modelVersion:string;configVersion:string;repCount:number;repCountStatus:'AVAILABLE';formStatus:string;completedAt:string;expiresAt:string}
export interface Log {id:string;occurrenceId?:string;poseResultId?:string;poseSummary?:ImportedPoseSummary;performedAt:string;durationSeconds?:number;notes?:string;source:'MANUAL'|'OCCURRENCE'|'POSE';version:number;createdAt:string;updatedAt:string;sets:(ActualSet&{exerciseNameVi:string})[]}
export interface Summary {from:string;to:string;timeZone:string;workoutCount:number;totalRepetitions:number;totalVolumeKg:number;series:{date:string;workoutCount:number;repetitions:number;volumeKg:number}[]}
export const sourceLabel={MANUAL:'Nhập tay',OCCURRENCE:'Theo lịch',POSE:'Từ kết quả AI'};
export const numberLabel=(value:number)=>new Intl.NumberFormat('vi-VN',{maximumSignificantDigits:17}).format(value);
