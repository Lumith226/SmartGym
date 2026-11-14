import nodemailer from 'nodemailer';
import { EmailDelivery } from '../../contracts.js';
import { DeliveryError,MailProvider } from './jobs.js';
export interface SmtpConfig{host:string;port:number;from:string;secure:boolean;allowLocal:boolean;user?:string;password?:string;ca?:string}
export class SmtpProvider implements MailProvider {
  private readonly transport;
  constructor(config:SmtpConfig,private readonly webOrigin?:string){
    if(webOrigin&&new URL(webOrigin).origin!==webOrigin)throw new Error('Invalid Web origin');
    const local=config.allowLocal&&process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1','::1'].includes(config.host);
    if(!Number.isInteger(config.port)||config.port<1||config.port>65535||!/^[^\s<>@]+@[^\s<>@]+$/.test(config.from)||/[\r\n]/.test(config.from))throw new Error('Invalid SMTP configuration');
    this.transport=nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,requireTLS:!local&&!config.secure,
      ignoreTLS:local,auth:config.user?{user:config.user,pass:config.password}:undefined,
      connectionTimeout:5000,greetingTimeout:5000,socketTimeout:5000,
      tls:{rejectUnauthorized:true,...(config.ca?{ca:config.ca}:{})},logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
    this.from=config.from;
  }
  private readonly from:string;
  async send(delivery:EmailDelivery,messageId:string){
    const verify=delivery.purpose==='VERIFY_EMAIL';
    await this.sendText(delivery.recipient,messageId,verify?'Xác minh email SmartGym':'Đặt lại mật khẩu SmartGym',
      (verify?'Xác nhận địa chỉ email của bạn':'Bạn đã yêu cầu đặt lại mật khẩu')+' bằng liên kết sau:\n\n'+delivery.actionUrl+'\n\nLiên kết hết hạn: '+delivery.expiresAt+'\nNếu bạn không yêu cầu, hãy bỏ qua email này.');
  }
  async sendReminder(delivery:{recipient:string;occurrenceId:string;startAt:string;timeZone:string},messageId:string){
    if(!this.webOrigin||!/^[a-f0-9-]{36}$/i.test(delivery.occurrenceId))throw new DeliveryError('FAILED','REMINDER_CONFIG_INVALID');
    const starts=new Intl.DateTimeFormat('vi-VN',{timeZone:delivery.timeZone,dateStyle:'full',timeStyle:'short'}).format(new Date(delivery.startAt));
    await this.sendText(delivery.recipient,messageId,'Sắp đến giờ tập SmartGym','Buổi tập của bạn bắt đầu lúc '+starts+' ('+delivery.timeZone+').\n\n'+
      this.webOrigin+'/app/lich/buoi/'+delivery.occurrenceId+'\n\nBạn có thể thay đổi tùy chọn nhắc lịch trong tài khoản SmartGym.');
  }
  private async sendText(recipient:string,messageId:string,subject:string,text:string){
    try{
      const result=await this.transport.sendMail({from:{name:'SmartGym',address:this.from},to:{address:recipient,name:''},messageId,
        subject,text,textEncoding:'base64',
        disableFileAccess:true,disableUrlAccess:true});
      if(result.accepted.length!==1)throw new DeliveryError('FAILED','SMTP_RECIPIENT_REJECTED');
    }catch(error){
      if(error instanceof DeliveryError)throw error;
      const failure=error as {responseCode?:number;code?:string;command?:string;timeoutType?:string;originalCode?:string};
      if(failure.responseCode&&failure.responseCode>=400&&failure.responseCode<500)throw new DeliveryError('RETRY','SMTP_TEMPORARY_REJECTION');
      if(failure.responseCode&&failure.responseCode>=500)throw new DeliveryError('FAILED','SMTP_PERMANENT_REJECTION');
      // Nodemailer 10 labels even post-DATA idle timeout as command=CONN.
      // Only explicit pre-send evidence permits automatic retry.
      if(['CONNECT_TIMEOUT','GREETING_TIMEOUT','UPGRADE_TIMEOUT'].includes(failure.timeoutType??'')||
        ['ECONNECTION','EDNS'].includes(failure.code??'')||['ECONNREFUSED','ENOTFOUND','ENETUNREACH'].includes(failure.originalCode??''))throw new DeliveryError('RETRY','SMTP_NOT_CONNECTED');
      throw new DeliveryError('UNKNOWN','SMTP_ACCEPTANCE_UNKNOWN');
    }
  }
  close(){this.transport.close();}
}
