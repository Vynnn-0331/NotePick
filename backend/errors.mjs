export class AiError extends Error {
 constructor(code,status,message){super(message);this.code=code;this.status=status;}
}
export const fail=(code,status,message)=>{throw new AiError(code,status,message);};
