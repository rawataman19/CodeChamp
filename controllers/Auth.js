const User=require("../models/User");
const OTP=require("../models/OTP");
const OtpGenerator=require("otp-generator");
const bcrypt=require("bcrypt");
const Profile = require("../models/Profile");
const jwt=require("jsonwebtoken");
const { mailSender } = require("../utils/MailSender");
require("dotenv").config();


//Controller for OTP GENERATION :First time registration k time 
exports.sendOTP=async(req,res)=>{
    try{
        //extract email from request body
        const {email}=req.body;

        //checking if user already registered : then returning him/her
        const UserExist=await User.findOne({emailID:email});
        if(UserExist){
            return res.status(400).json({
                success:false,
                message:"User already registered",

            })
        }

        let otp=0;
        let existingOTP;
        //generating a otp till we get a unique otp
        do{
            otp= OtpGenerator.generate(6,{
                digits:true,
                lowerCaseAlphabets:false,
                upperCaseAlphabets:false,
                specialChars:false,
            });
            existingOTP=await OTP.findOne({otp});
        }while(existingOTP);

        //storing the otp in the database for the matching task
        const otpPayload={email,otp};

        const otpBody=await OTP.create(otpPayload);
        return res.status(200).json({
            success:true,
            message:"OTP stored successfully",
            otp,
        })
    }catch(error){
        console.log("error occured  during otp generation ",error);
        return res.status(500).json({
            success:false,
            message:"OTP GENERATION FALED",
            error
        })
    }
}


//signup
exports.signUp=async(req,res)=>{
    try{
        //extract data from the body
        const {
            firstName,
            lastName,
            email,
            password,
            confirmPassword,
            accountType,
            phoneNumber,
            otp
        }=req.body;
        
        //validating if all the fields are filled
        if(!firstName || !lastName || !email || !password || !otp){
            return res.status(401).json({
                success:false,
                message:"All fields are mandatory",
            })
        }

        //checking if confirm password matches the password
        if(confirmPassword!==password){
            return res.status(400).json({
                success:false,
                message:"Confirm Password do not match the Password",
            })
        }
        
        //ensuring the user is visiting the first time 
        const UserExist=await User.findOne({emailID:email});
        if(UserExist){
            return res.status(500).json({
                success:false,
                message:"User already registered",
            })
        }
        //extracting out the latest otp
        const recentOtp=await OTP.findOne({email}).sort({createdAt:-1}).exec();
        console.log(recentOtp);
        //validating the otp
        if(!recentOtp || recentOtp.length==0){
            return res.status(500).json({
                success:false,
                message:"OTP NOT FOUND",
            })
        }//matching the database otp and the entered otp
        else if(recentOtp.otp!==otp){
            return res.status(500).json({
                success:false,
                message:"Otp do not match ",
            })
        }
    
        //hashing the password by bcrpty for security reasons
        const hashedPassword=await bcrypt.hash(password,10);
    
        const profilePayload={
            gender:null,
            dateOfBirth:null,
            phoneNumber,
            about:null,
        }
        //creating a profile id for the user
        const profileResponse=await Profile.create(profilePayload);
    
        const userPayload={
            firstName,
            lastName,
            emailID:email,
            password:hashedPassword,
            accountType,
            additionalDetails:profileResponse._id,
            image:`https://api.dicebear.com/8.x/initials/svg?seed=${firstName} ${lastName}`//image api for initials image
        }
        const userResponse=await User.create(userPayload);
    
        return res.status(200).json({
            success:true,
            message:"Signup was successfull",
            userResponse,
        })
    }catch(error){
        console.log("Error occured while signup ",error);
        return res.status(500).json({
            success:false,
            message:"Signup failed"
        })
    }
}


//login
exports.login=async(req,res)=>{
    try{
        //extract from body
        const {email,password}=req.body;
        //validation 
        if(!email || !password ){
            return res.status(500).json({
                success:false,
                message:"Email or Password field is empty",
            })
        }
        //matching password if user exist 
        const user=await User.findOne({emailID:email})
        .populate("additionalDetails")
        .exec();
        if(!user){
            return res.status(400).json({
                success:false,
                message:"User needs to signup first",
            })
        }

        if(await bcrypt.compare(password,user.password)){
            //creating payload for creating json web token that could be parsed in the cookie
            const payload={
                accountType:user.accountType,
                id:user._id,
                email
            }

            const token=jwt.sign(payload,process.env.JWT_SECRET,{
                expiresIn:"24h"
            });
            user.token=token;
            user.password=undefined;

            const options={
                expires:new Date( Date.now()+3*24*60*60),//expires in 3 days
                httpOnly:true,
            }
            //setting up cookie with token = token 
            res.cookie("token",token,options).status(200).json({
                success:true,
                user,
                token,
                message:"Login was successfull",
            })
        }
        else{
            //password dont match 
            return res.status(401).json({
                success: false,
                message: "Incorrect email or password"
            });
        }
    }catch(error){
        console.log("Error occuring during login ",error);
        return res.status(500).json({
            success:false,
            message:"Login failed",
        })
    }
}



//change password 
exports.changePassword=async(req,res)=>{
    
    try{
        //fetching
        const {oldPassword,newPassword}=req.body;
		const user = await User.findById(req.user.id);
        const email=user.emailID;

        //validation  
        if(!oldPassword || !newPassword || !email){
            return res.status(500).json({
                success:false,
                message:"All fields must be filled",
            })
        }

        console.log(oldPassword,"  ",newPassword);
        //validation 
        // if(newPassword!==confirmPassword){
        //     return res.status(500).json({
        //         success:false,
        //         message:"Confirm Password do not match ",
        //     })
        // }
        //seeing if the old password is same 
        if(await bcrypt.compare(oldPassword,user.password)){
            const hashedPassword=await bcrypt.hash(newPassword,10);
            const updatedDetails=await User.findOneAndUpdate({emailID:email},{
                password:hashedPassword,
            },
            {new:true});
    
            await mailSender(email,"Password Updation ","Your password was successfully successfully");
        }
        else{
            return res.status(500).json({
                success:false,
                message:"Old password is wrong ",
            })
        }
        return res.status(200).json({
            success:true,
            message:"Password was changed successfully",
        })
        
    }
    catch(error){
        console.log("Password updation failed",error);
        return res.status(500).json({
            success:false,
            message:"Error during password updation ",
        })
    }
}
