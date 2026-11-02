import { useState } from "react";
import CryptoJS from 'crypto-js';
import axios from 'axios';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { registerUser, loginUser, API_APPS_URL } from "@/api";
import { HELP_URL, PRIVACY_URL, EULA_URL, APP_PUBLIC_URL, REGISTER_EMAIL_IMAGE_URL } from "@/config";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Check, X } from "lucide-react";
import { set } from "date-fns";

const Register = () => {
  const navigate = useNavigate();
  // Removed unused useState
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    contactNumber: "",
    address: "",
    organizationName: "",
    acceptTerms: false
  });
  const [fieldValidation, setFieldValidation] = useState({
    firstName: false,
    lastName: false,
    email: false,
    username: false,
    password: false,
    confirmPassword: false,
    contactNumber: false,
    organizationName: false,
    address: false
  });
  const [errors, setErrors] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    contactNumber: "",
    address: "",
    organizationName: "",
    general: ""
  });

  const [showSaveAllDialog, setShowSaveAllDialog] = useState(false);
  const [saveAllDialogType, setSaveAllDialogType] = useState("success"); // or "error"
  const [saveAllDialogMessage, setSaveAllDialogMessage] = useState("");

  const handleInputChange = (field: keyof typeof formData, value: string | boolean) => {
    // Sanitize inputs per requirements
    let nextValue: typeof value = value;
    if (typeof value === 'string') {
      if (field === 'firstName' || field === 'lastName') {
        // Allow only letters and spaces (no numbers or special chars)
        nextValue = value.replace(/[^A-Za-z\s]/g, '').slice(0, 60);
      } else if (field === 'username') {
        // Username must be alphanumeric only and limited to 60 chars
        nextValue = value.replace(/[^A-Za-z0-9]/g, '').slice(0, 60);
      } else if (field === 'organizationName') {
        // limit organization name to 60 chars
        nextValue = value.slice(0, 60);
      } else if (field === 'address') {
        // limit address to 1000 chars
        nextValue = value.slice(0, 1000);
      } else if (field === 'contactNumber') {
        // Strip any non-digit characters, allow a single leading '+' only
        // Enforce maximum of 13 digits (plus optional leading '+')
        if (value.startsWith('+')) {
          let rest = value.slice(1).replace(/\D+/g, '');
          rest = rest.slice(0, 13); // limit to 13 digits
          nextValue = '+' + rest;
        } else {
          nextValue = value.replace(/\D+/g, '').slice(0, 13);
        }
      } else if (field === 'password' || field === 'confirmPassword') {
        // Limit passwords to 60 characters
        nextValue = value.slice(0, 60);
      }
    }

    setFormData(prev => ({ ...prev, [field]: nextValue as any }));

    if (errors[field as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [field]: "", general: "" }));
    }

    if (typeof nextValue === 'string' && nextValue.length > 0) {
      if (field === 'email') {

        // and a TLD between 2 and 63 letters. This is a practical, robust regex.
        const emailRegex = /^([A-Za-z0-9._%+-]{1,64})@(([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63})$/;
        setFieldValidation(prev => ({ ...prev, [field]: emailRegex.test(nextValue) }));
      } else if (field === 'firstName') {
        const nameOk = /^[A-Za-z\s]+$/.test(nextValue);
        setFieldValidation(prev => ({ ...prev, [field]: nameOk && (nextValue as string).length <= 60 }));
      } else if (field === 'lastName') {
        const nameOk = /^[A-Za-z\s]+$/.test(nextValue);
        setFieldValidation(prev => ({ ...prev, [field]: nameOk && (nextValue as string).length <= 60 }));
      } else if (field === 'organizationName') {
        setFieldValidation(prev => ({ ...prev, [field]: (nextValue as string).trim().length > 0 && (nextValue as string).length <= 60 }));
      } else if (field === 'address') {
        setFieldValidation(prev => ({ ...prev, [field]: (nextValue as string).length <= 1000 }));
      } else if (field === 'username') {
        const unameOk = /^[A-Za-z0-9]+$/.test(nextValue) && (nextValue as string).length <= 60;
        setFieldValidation(prev => ({ ...prev, [field]: unameOk }));
      } else if (field === 'password') {
        setFieldValidation(prev => ({ ...prev, [field]: (nextValue as string).length >= 6 && (nextValue as string).length <= 60 }));
      } else if (field === 'confirmPassword') {
        setFieldValidation(prev => ({ ...prev, [field]: nextValue === formData.password && (nextValue as string).length >= 6 && (nextValue as string).length <= 60 }));
      } else if (field === 'contactNumber') {
        const phoneRegex = /^\+?\d{10,13}$/; // allow optional + and 10-13 digits
        setFieldValidation(prev => ({ ...prev, [field]: phoneRegex.test(nextValue) }));
      } else {
        setFieldValidation(prev => ({ ...prev, [field]: (nextValue as string).trim().length > 0 }));
      }
    } else if (typeof nextValue === 'boolean') {
      if (field === 'acceptTerms') {
        setFieldValidation(prev => ({ ...prev, [field]: nextValue }));
      }
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = { ...errors };
    let hasErrors = false;

    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
      hasErrors = true;
    } else if (formData.firstName.length > 60) {
      newErrors.firstName = "First name must be at most 60 characters";
      hasErrors = true;
    } else if (!/^[A-Za-z\s]+$/.test(formData.firstName)) {
      newErrors.firstName = "Only letters allowed";
      hasErrors = true;
    }
    if (formData.lastName && formData.lastName.length > 60) {
      newErrors.lastName = "Last name must be at most 60 characters";
      hasErrors = true;
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
      hasErrors = true;
    } else if (!fieldValidation.email) {
      newErrors.email = 'Enter a valid email address (local ≤60 chars, TLD ≤5 chars)';
      hasErrors = true;
    }
    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
      hasErrors = true;
    } else if (!/^[A-Za-z0-9]+$/.test(formData.username)) {
      newErrors.username = "Username must be alphanumeric";
      hasErrors = true;
    }
    if (!formData.password.trim()) {
      newErrors.password = "Password is required";
      hasErrors = true;
    } else if (formData.password.length > 60) {
      newErrors.password = "Password must be at most 60 characters";
      hasErrors = true;
    } else if (!fieldValidation.password) {
      newErrors.password = "Password must be at least 6 characters";
      hasErrors = true;
    }
    if (!formData.confirmPassword.trim()) {
      newErrors.confirmPassword = "Confirm your password";
      hasErrors = true;
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
      hasErrors = true;
    } else if (formData.confirmPassword.length > 60) {
      newErrors.confirmPassword = "Confirm password must be at most 60 characters";
      hasErrors = true;
    }
    if (!formData.organizationName.trim()) {
      newErrors.organizationName = "Organization name is required";
      hasErrors = true;
    }
    if (formData.organizationName && formData.organizationName.length > 60) {
      newErrors.organizationName = "Organization name must be at most 60 characters";
      hasErrors = true;
    }
    if (formData.address && formData.address.length > 1000) {
      newErrors.address = "Address must be at most 1000 characters";
      hasErrors = true;
    }
    if (!formData.acceptTerms) {
      newErrors.general = "Accept the terms to continue";
      hasErrors = true;
    }

    // Validate contact number if provided: optional leading '+' and 10-13 digits
    if (formData.contactNumber && formData.contactNumber.trim()) {
      const phoneRegex = /^\+?\d{10,12}$/;
      if (!phoneRegex.test(formData.contactNumber.trim())) {
        newErrors.contactNumber = 'Contact number must be 10–12 digits (optional leading +)';
        hasErrors = true;
      }
    }

    if (hasErrors) {
      setErrors(newErrors);
      return;
    }

    try {
      const payload = {
        firstname: formData.firstName,
        lastname: formData.lastName,
        email: formData.email,
        contactnumber: formData.contactNumber || "",
        address: formData.address || "",
        orgname: formData.organizationName,
        username: formData.username,
        password: formData.password,
        createdBy: "",
        userID: 0
      };

      const response = await registerUser(payload);

      // Defensive: try to extract a message from the response
      let errorMsg = '';
      if (response && typeof response === 'object') {
        errorMsg = response.message || '';
      }

      if (response.status === "S001") {
        // Show backend message if available, else fallback
        const successMsg = response.message || "✅ Registration successful. Please login.";
        // Log the full response for debugging
        // eslint-disable-next-line no-console
        // setShowSaveAllDialog(true);
        // setSaveAllDialogMessage(successMsg);
        // setSaveAllDialogType("success");
        sessionStorage.setItem("tempUserEmail", formData.email);
        sessionStorage.setItem("tempUserName", formData.username);
        //console.log("Registration success response:", response);

        // Function to send registration email after successful registration
        const sendRegistrationEmail = async (username: string, email: string) => {
          const dynamicKey = 'Excelsoft'; // Use a static key for simplicity; consider using a more secure method in production 
          const userData = JSON.stringify({ username, email });
          const encryptedData = CryptoJS.AES.encrypt(userData, dynamicKey).toString();
          const encodedEncryptedData = encodeURIComponent(encryptedData);
          //const loginUrl = `https://ailevate-poc.excelsoftcorp.com/#/login?data=${encodedEncryptedData}`;
          const loginUrl = `${APP_PUBLIC_URL}/#/login?data=${encodedEncryptedData}`;
          const emailBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; text-align: center; padding: 20px;">
      <img src="${REGISTER_EMAIL_IMAGE_URL}" alt="Welcome to AI-Levate" style="max-width: 100%; height: auto; margin-bottom: 20px; border-radius: 10px;">
      <h1 style="color: #007bff;">Hi ${username},</h1>
      <p style="font-size: 16px; margin-bottom: 20px;">
        Congratulations! You have been successfully registered to <strong>AI-Levate</strong>.
      </p>
      <p style="font-size: 16px; margin-bottom: 20px;">
        Please verify your login by clicking on the below link:
      </p>
      <a href="${loginUrl}" 
        style="display: inline-block; background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px;">
        Login
      </a>
      <p style="margin-top: 30px; font-size: 14px; color: #555;">
        Thanks and Regards,<br>
        <strong>Excelsoft Technologies Ltd</strong><br>
        Mysore
      </p>
    </div>
  `;
          const emailData = {
            to: email,
            subject: 'Registration Successful - AI-Levate',
            body: emailBody,
          };

          try {
            const response = await axios.post(
              `${API_APPS_URL}/send-email`,
              emailData
            );
            if (response?.data?.status === 'success') {
              // Optionally show a toast or notification here
              // Email sent successfully

              setShowSaveAllDialog(true);
              setSaveAllDialogMessage("Registration successful. A secure login link has been sent to your email to validate your logins.");
              setSaveAllDialogType("success");
              //alert("Email sent successfully. Please check your inbox.");

              // After sending mail, activate user and perform login, as requested
              try {
                const activateUrl = `${API_APPS_URL}/updateActiveRegisteredUser`;
                await axios.post(activateUrl, { username, email });
                const loginRes = await loginUser(username, formData.password);
                if (loginRes?.status === 'S001' && Array.isArray(loginRes.data) && loginRes.data.length > 0) {
                  const userData = loginRes.data[0];
                  try { sessionStorage.setItem('userInfo', JSON.stringify(userData)); } catch { }
                  sessionStorage.setItem('isLogin', 'true');
                  sessionStorage.setItem('username', username);
                  sessionStorage.setItem('password', formData.password);
                  sessionStorage.setItem('userCode', userData.userCode);
                  sessionStorage.setItem('orgCode', userData.orgCode);
                  sessionStorage.setItem('customerCode', userData.customerCode);
                  sessionStorage.setItem('userRole', userData.userRole);
                  // Navigate to dashboard so it fetches get_app_details
                  navigate('/dashboard');
                }
              } catch (e) {
                // Non-blocking: activation/login post-mail should not prevent UX
              }
            } else {
              // Optionally handle email send failure
              // eslint-disable-next-line no-console

              setShowSaveAllDialog(true);
              setSaveAllDialogType("Failed to send email. Please contact support.");
              setSaveAllDialogType("error");
              //alert("Failed to send email. Please contact support.");
              console.error('Failed to send email:', response.data);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            setShowSaveAllDialog(true);
            setSaveAllDialogType("Error sending email. Please contact support.");
            //alert("Error sending email. Please contact support.");
            console.error('Error sending email:', error);
          }
        };

        // Call the email function after successful registration
        // Call the email function after successful registration
        // Move this call to after the function declaration to avoid TDZ error
        sendRegistrationEmail(formData.username, formData.email).then(() => {
          navigate("/register");
        });
        return;
      } else if (response.status === 'FL001') {
        setErrors(prev => ({ ...prev, general: 'User already exists.' }));
      } else if (response.status === 'O001') {
        setErrors(prev => ({ ...prev, general: 'Organization already exists.' }));
      } else if (response.status === 'LO001') {
        setErrors(prev => ({ ...prev, general: 'The User Name already exists.' }));
      } else if (response.status === 'EM001') {
        setErrors(prev => ({ ...prev, general: 'The Email already exists.' }));
      } else if (errorMsg) {
        setErrors(prev => ({ ...prev, general: errorMsg }));
      } else {
        setErrors(prev => ({ ...prev, general: 'User registration failed' }));
      }
    } catch (error: any) {
      // Robust error extraction for various error shapes (Axios, fetch, etc.)
      // Log error for debugging
      // eslint-disable-next-line no-console
      console.error("Registration error (full object):", error);
      let errorMsg = "Registration failed";
      const status = error?.response?.data?.status;
      if (status === 'FL001') {
        errorMsg = 'User already exists.';
      } else if (status === 'O001') {
        errorMsg = 'Organization already exists.';
      } else if (status === 'LO001') {
        errorMsg = 'The User Name already exists.';
      } else if (status === 'EM001') {
        errorMsg = 'The Email already exists.';
      } else if (error?.response?.data?.message) {
        errorMsg = error.response.data.message;
      } else if (error?.message) {
        errorMsg = error.message;
      } else if (typeof error === 'string') {
        errorMsg = error;
      } else if (error?.toString) {
        errorMsg = error.toString();
      }
      // If still default, show a user-friendly fallback instead of just '{}'
      if (
        (errorMsg === "Registration failed" || errorMsg === "{}" || errorMsg === "[object Object]") &&
        error && typeof error === 'object' && Object.keys(error).length === 0
      ) {
        errorMsg = "Registration failed. Please check your details or try a different email/username.";
      }
      setErrors(prev => ({ ...prev, general: errorMsg }));
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 relative overflow-hidden">
      {/* Animated Background Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-r from-blue-400/20 to-cyan-400/20 rounded-full blur-3xl animate-spin" style={{ animationDuration: '20s' }} />
        <div className="absolute top-1/3 -right-20 w-64 h-64 bg-gradient-to-r from-purple-400/15 to-pink-400/15 rounded-full blur-3xl animate-spin" style={{ animationDuration: '25s', animationDirection: 'reverse' }} />
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-gradient-to-r from-yellow-400/10 to-orange-400/10 rounded-full blur-3xl animate-spin" style={{ animationDuration: '30s' }} />

        {/* Floating Elements */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-400/40 rounded-full animate-pulse" />
        <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-purple-400/40 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-3/4 w-1.5 h-1.5 bg-cyan-400/40 rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 min-h-screen flex">
        {/* Left Side - AI Illustration Area */}
        <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12">
          <div className="max-w-md text-center space-y-8">
            {/* AI-Levate Logo */}
            <div className="flex items-center justify-center space-x-3 mb-8">
              <img
                src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                alt="AI-Levate"
                className="h-12 w-auto"
              />
            </div>

            {/* Abstract AI Visualization */}
            <div className="relative mx-auto w-80 h-80">
              {/* Central Core */}
              <div className="absolute inset-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-gradient-to-r from-primary to-blue-500 rounded-full shadow-2xl animate-pulse" />

              {/* Orbiting Elements */}
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: '20s' }}>
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full opacity-80" />
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full opacity-80" />
              </div>

              <div className="absolute inset-0 animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }}>
                <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-10 h-10 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full opacity-80" />
                <div className="absolute top-1/2 left-0 transform -translate-y-1/2 w-6 h-6 bg-gradient-to-r from-red-400 to-rose-400 rounded-full opacity-80" />
              </div>

              {/* Neural Network Lines */}
              <div className="absolute inset-0">
                <svg className="w-full h-full opacity-30" viewBox="0 0 320 320">
                  <defs>
                    <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#2e5c9e" />
                      <stop offset="100%" stopColor="#06B6D4" />
                    </linearGradient>
                  </defs>
                  <path d="M160,60 Q160,160 60,160" stroke="url(#lineGradient)" strokeWidth="2" fill="none" className="animate-pulse" />
                  <path d="M160,60 Q160,160 260,160" stroke="url(#lineGradient)" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: '0.5s' }} />
                  <path d="M60,160 Q160,160 160,260" stroke="url(#lineGradient)" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: '1s' }} />
                  <path d="M260,160 Q160,160 160,260" stroke="url(#lineGradient)" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: '1.5s' }} />
                </svg>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-4xl font-bold text-gray-900 leading-tight">
                Join the Future of
                <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent"> AI Innovation</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                Create your account and unlock the full potential of AI-powered automation and intelligent workflows.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Register Form */}
        <div className="flex-1 lg:w-1/2 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <div className="lg:hidden flex items-center justify-center mb-8">
              <img
                src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                alt="AI-Levate"
                className="h-10 w-auto"
              />
            </div>

            <Card className="border-0 shadow-2xl bg-white/70 backdrop-blur-sm">
              <CardContent className="p-8">
                {/* Header */}
                <div className="text-center mb-8">
                  <div className="text-sm text-gray-500 mb-4">
                    Already have an account?{' '}
                    <button
                      onClick={() => navigate('/')}
                      className="text-primary hover:text-primary/80 font-medium transition-colors underline"
                    >
                      Sign in
                    </button>
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h2>
                  <p className="text-gray-600">Join the AI-powered platform</p>
                </div>

                {/* Simple Registration Form */}
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {/* General Error Message */}
                  {errors.general && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg animate-fade-in">
                      <div className="flex items-center">
                        <AlertCircle className="w-4 h-4 text-red-500 mr-2 flex-shrink-0" />
                        <p className="text-sm text-red-700">{errors.general}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Input
                        placeholder="First Name *"
                        value={formData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        className={`h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200 ${errors.firstName ? 'border-red-300 focus:border-red-500 focus:ring-red-200' :
                          fieldValidation.firstName ? 'border-green-300 focus:border-green-500' : ''
                          }`}
                      />
                      {errors.firstName && (
                        <div className="flex items-center mt-1 animate-fade-in">
                          <AlertCircle className="w-3 h-3 text-red-500 mr-1 flex-shrink-0" />
                          <p className="text-xs text-red-600">{errors.firstName}</p>
                        </div>
                      )}
                    </div>
                    <Input
                      placeholder="Last Name"
                      value={formData.lastName}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                      className="h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                    />
                  </div>

                  <div>
                    <Input
                      type="email"
                      placeholder="Email Address *"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className={`h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200 ${errors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-200' :
                        fieldValidation.email && formData.email ? 'border-green-300 focus:border-green-500' : ''
                        }`}
                    />
                    {errors.email && (
                      <div className="flex items-center mt-2 animate-fade-in">
                        <AlertCircle className="w-4 h-4 text-red-500 mr-1 flex-shrink-0" />
                        <p className="text-sm text-red-600">{errors.email}</p>
                      </div>
                    )}
                    {!errors.email && fieldValidation.email && formData.email && (
                      <div className="flex items-center mt-2 animate-fade-in">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mr-1 flex-shrink-0" />
                        <p className="text-sm text-green-600">Valid email format</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <Input
                      placeholder="Username *"
                      value={formData.username}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      className={`h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200 ${errors.username ? 'border-red-300 focus:border-red-500 focus:ring-red-200' :
                        fieldValidation.username && formData.username ? 'border-green-300 focus:border-green-500' : ''
                        }`}
                    />
                    {errors.username && (
                      <div className="flex items-center mt-2 animate-fade-in">
                        <AlertCircle className="w-4 h-4 text-red-500 mr-1 flex-shrink-0" />
                        <p className="text-sm text-red-600">{errors.username}</p>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password *"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      maxLength={60}
                      className={`h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200 pr-12 ${errors.password ? 'border-red-300 focus:border-red-500 focus:ring-red-200' :
                        fieldValidation.password && formData.password ? 'border-green-300 focus:border-green-500' : ''
                        }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "Hide" : "Show"}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>

                  </div>
                  {errors.password && (
                    <div className="flex items-center mt-2 animate-fade-in">
                      <AlertCircle className="w-4 h-4 text-red-500 mr-1 flex-shrink-0" />
                      <p className="text-sm text-red-600">{errors.password}</p>
                    </div>
                  )}
                  {!errors.password && fieldValidation.password && formData.password && (
                    <div className="flex items-center mt-2 animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mr-1 flex-shrink-0" />
                      <p className="text-sm text-green-600">Strong password</p>
                    </div>
                  )}

                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm Password *"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      maxLength={60}
                      className={`h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200 pr-12 ${errors.confirmPassword ? 'border-red-300 focus:border-red-500 focus:ring-red-200' :
                        fieldValidation.confirmPassword && formData.confirmPassword ? 'border-green-300 focus:border-green-500' : ''
                        }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "Hide" : "Show"}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>

                  </div>
                  {errors.confirmPassword && (
                    <div className="flex items-center mt-2 animate-fade-in">
                      <AlertCircle className="w-4 h-4 text-red-500 mr-1 flex-shrink-0" />
                      <p className="text-sm text-red-600">{errors.confirmPassword}</p>
                    </div>
                  )}
                  {!errors.confirmPassword && fieldValidation.confirmPassword && formData.confirmPassword && (
                    <div className="flex items-center mt-2 animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mr-1 flex-shrink-0" />
                      <p className="text-sm text-green-600">Passwords match</p>
                    </div>
                  )}

                  <div>
                    <Input
                      type="tel"
                      placeholder="Contact Number"
                      value={formData.contactNumber}
                      onChange={(e) => handleInputChange('contactNumber', e.target.value)}
                      className={`h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200 ${errors.contactNumber ? 'border-red-300 focus:border-red-500 focus:ring-red-200' :
                        fieldValidation.contactNumber && formData.contactNumber ? 'border-green-300 focus:border-green-500' : ''
                        }`}
                      maxLength={14}
                    />
                    {errors.contactNumber && (
                      <div className="flex items-center mt-2 animate-fade-in">
                        <AlertCircle className="w-4 h-4 text-red-500 mr-1 flex-shrink-0" />
                        <p className="text-sm text-red-600">{errors.contactNumber}</p>
                      </div>
                    )}
                    {!errors.contactNumber && fieldValidation.contactNumber && formData.contactNumber && (
                      <div className="flex items-center mt-2 animate-fade-in">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mr-1 flex-shrink-0" />
                        <p className="text-sm text-green-600">Valid contact number</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm text-gray-700 mb-1 block">Address</label>
                    <textarea
                      placeholder="Address"
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      className={`w-full min-h-[72px] p-3 border border-gray-200 rounded-md bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200 ${errors.address ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''}`}
                      maxLength={1000}
                      rows={4}
                    />
                    {errors.address && (
                      <div className="flex items-center mt-2 animate-fade-in">
                        <AlertCircle className="w-4 h-4 text-red-500 mr-1 flex-shrink-0" />
                        <p className="text-sm text-red-600">{errors.address}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <Input
                      placeholder="Organization Name *"
                      value={formData.organizationName}
                      onChange={(e) => handleInputChange('organizationName', e.target.value)}
                      maxLength={60}
                      className={`h-12 border-gray-200 bg-white/80 focus:border-primary focus:ring-primary/20 transition-all duration-200 ${errors.organizationName ? 'border-red-300 focus:border-red-500 focus:ring-red-200' :
                        fieldValidation.organizationName && formData.organizationName ? 'border-green-300 focus:border-green-500' : ''
                        }`}
                    />
                    {errors.organizationName && (
                      <div className="flex items-center mt-2 animate-fade-in">
                        <AlertCircle className="w-4 h-4 text-red-500 mr-1 flex-shrink-0" />
                        <p className="text-sm text-red-600">{errors.organizationName}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-start space-x-2 py-2">
                    <Checkbox
                      id="terms"
                      checked={formData.acceptTerms}
                      onCheckedChange={(checked) => handleInputChange('acceptTerms', checked as boolean)}
                    />
                    <Label htmlFor="terms" className="text-sm text-gray-600 cursor-pointer">
                      I accept the{' '}
                      <a href={EULA_URL} className="text-primary hover:text-primary/80 underline">
                        End User License Agreement (EULA)
                      </a>
                    </Label>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-[#2563eb] hover:bg-[#2563eb]/90 text-white font-semibold rounded-lg transform transition-all duration-200 hover:scale-[1.02]"
                  >
                    Create Account
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Dialog open={showSaveAllDialog} onOpenChange={setShowSaveAllDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${saveAllDialogType === "success" ? "bg-green-100" : "bg-red-100"
                      }`}>
                      {saveAllDialogType === "success" ? (
                        <Check className="w-6 h-6 text-green-600" />
                      ) : (
                        <X className="w-6 h-6 text-red-600" />
                      )}
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-semibold text-gray-900">
                        {saveAllDialogType === "success" ? "Save Successful!" : "Save Failed"}
                      </DialogTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        {saveAllDialogMessage}
                      </p>
                    </div>
                  </div>
                </DialogHeader>
                <div className="flex justify-end pt-4">
                  <Button
                    onClick={() => {
                      setShowSaveAllDialog(false);
                      navigate('/');
                    }}
                    className={saveAllDialogType === "success"
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"}
                  >
                    OK
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Footer */}
            <div className="mt-8 text-center space-y-2">
              <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
                <Sparkles className="w-3 h-3" />
                <span className="flex items-center gap-1">Powered By:
                  <img
                    src="/lovable-uploads/b5b0f5a8-9552-4635-8c44-d5e6f994179c.png"
                    alt="AI-Levate"
                    className="h-3 w-auto"
                  />
                </span>
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <p>Copyright © 2026 | Excelsoft Technologies Ltd.</p>
                <div className="flex items-center justify-center space-x-4">
                  <a href={PRIVACY_URL} className="hover:text-primary transition-colors">Privacy and Cookie Policy</a>
                  <span>•</span>
                  <a href={HELP_URL} className="hover:text-primary transition-colors">Help</a>
                  <span>•</span>
                  <span>Version: V.1.0.0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
